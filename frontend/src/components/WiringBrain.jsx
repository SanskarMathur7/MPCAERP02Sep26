/**
 * MPCA Governance Controller · The Wiring Brain (Feb 2026)
 * ────────────────────────────────────────────────────────
 * A living SVG "neural" diagram of the MPCA governance matrix — the decision
 * layer that every tournament action passes through. Rendered as the left
 * panel of the Login page to give the app an AI-first first impression.
 *
 *   8 tournament types (left column)
 * → 10 lifecycle steps  (middle column)
 * → 4 outcomes          (right column)
 *
 * · Every 3.2s a signal "fires" through a random path, echoing the wiring
 *   subsystem powering real approvals.
 * · Palette: DL.emerald (MPCA-owned), DL.gold (Division/District), DL.paper
 *   (idle wire), rendered on a deep ink canvas so it holds its own next to
 *   the light-panel login form.
 */
import { useEffect, useRef, useState } from "react";
import { DL } from "@/lib/designSystem";

const TYPES = [
    { id: "bcci",         label: "BCCI",             steps: "9 / 10 steps", y: 90,  owner: "m" },
    { id: "interdiv",     label: "Inter Division",   steps: "10 / 10 steps", y: 175, owner: "m" },
    { id: "camp",         label: "Pre-Tour Camp",    steps: "6 / 10 steps",  y: 260, owner: "d" },
    { id: "district",     label: "Inter District",   steps: "9 / 10 steps",  y: 345, owner: "d" },
    { id: "interschool",  label: "Inter-School",     steps: "7 / 10 steps",  y: 430, owner: "d" },
    { id: "interclub",    label: "Inter-Club (A)",   steps: "7 / 10 steps",  y: 515, owner: "d" },
    { id: "coaching",     label: "Coaching Camp",    steps: "7 / 10 steps",  y: 600, owner: "d" },
    { id: "vacation",     label: "Vacation Camp",    steps: "7 / 10 steps",  y: 685, owner: "d" },
];

const STEPS = [
    { id: "creation",   label: "Tournament Creation", y: 55,  phase: "pre" },
    { id: "pool",       label: "Pool (Basics)",       y: 120, phase: "pre" },
    { id: "officials",  label: "Match Official Posting", y: 185, phase: "pre" },
    { id: "squad",      label: "Squad",               y: 250, phase: "pre" },
    { id: "sq_approve", label: "Squad Approval",      y: 315, phase: "pre" },
    { id: "calendar",   label: "Match Calendar",      y: 400, phase: "in" },
    { id: "budget",     label: "Unified Budget",      y: 465, phase: "in" },
    { id: "finance",    label: "Finance Console",     y: 555, phase: "post" },
    { id: "closure",    label: "Tournament Closure",  y: 620, phase: "post" },
    { id: "visibility", label: "MPCA Visibility",     y: 685, phase: "post" },
];

const OUTCOMES = [
    { id: "mpca", label: "MPCA acts",     sub: "wired · 10 steps", y: 215, tone: "m" },
    { id: "div",  label: "Division acts", sub: "wired · 9 steps",  y: 355, tone: "d" },
    { id: "auto", label: "Automatic",     sub: "1 step · computed", y: 495, tone: "a" },
    { id: "na",   label: "Not applicable", sub: "3 steps · absent", y: 635, tone: "n" },
];

// Curated set of live wires — a sampling that hints at the full 62-edge matrix
// without turning the login into a spaghetti graph.
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

const typeById = (id) => TYPES.find(t => t.id === id);
const stepById = (id) => STEPS.find(s => s.id === id);
const outById  = (id) => OUTCOMES.find(o => o.id === id);

const ownerColor = (o) => o === "m" ? DL.gold : o === "a" ? "#5FA3E0" : o === "n" ? "#7A6B4E" : "#C9A45F";

export default function WiringBrain() {
    const [pulseKey, setPulseKey] = useState(0);
    const [pulsePath, setPulsePath] = useState(null);
    const timer = useRef(null);

    // Fire a fresh signal every 3.2s — a randomly chosen chain
    // (type → step → outcome) that lights up sequentially.
    useEffect(() => {
        const fire = () => {
            const inE = IN_EDGES[Math.floor(Math.random() * IN_EDGES.length)];
            const outE = OUT_EDGES.find(e => e[0] === inE[1]) || OUT_EDGES[0];
            setPulsePath({ t: inE[0], s: inE[1], o: outE[1], owner: inE[2] });
            setPulseKey(k => k + 1);
        };
        fire();
        timer.current = setInterval(fire, 3200);
        return () => clearInterval(timer.current);
    }, []);

    const edgeStyle = (owner, active) => ({
        stroke: active ? ownerColor(owner) : `rgba(200,180,138,${owner === "m" ? 0.35 : 0.14})`,
        strokeWidth: active ? 2 : 1,
        fill: "none",
        transition: "stroke 400ms ease, stroke-width 400ms ease",
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

            {/* corner label */}
            <div style={{
                position: "absolute", top: 88, left: 32, zIndex: 3, color: DL.gold,
                fontFamily: DL.fontMono, fontSize: 10, letterSpacing: "0.28em", textTransform: "uppercase", fontWeight: 700,
            }}>
                / The Wiring Brain
            </div>
            <div style={{
                position: "absolute", top: 106, left: 32, zIndex: 3, color: DL.paper,
                fontFamily: DL.fontDisplay, fontSize: 22, fontWeight: 800, letterSpacing: "-0.01em",
                maxWidth: 420, lineHeight: 1.15,
            }}>
                MPCA's governance controller
            </div>
            <div style={{
                position: "absolute", top: 142, left: 32, right: 32, zIndex: 3, color: "rgba(251,248,241,0.65)",
                fontFamily: DL.fontBody, fontSize: 11.5, lineHeight: 1.5, maxWidth: 420, fontWeight: 500,
            }}>
                Every tournament action routes through this decision layer.
                <span style={{ color: DL.gold }}> 8 types × 10 lifecycle steps × 4 outcomes = 62 live wires</span>
                {" "}the association edits, not software.
            </div>

            {/* live SVG diagram */}
            <svg
                viewBox="0 0 860 780"
                preserveAspectRatio="xMidYMid meet"
                style={{ position: "absolute", inset: 0, top: 200, width: "100%", height: "calc(100% - 240px)", zIndex: 1 }}
                aria-label="MPCA Governance wiring brain"
            >
                {/* Column captions */}
                <text x={TYPE_X} y={12} textAnchor="middle" fill={DL.gold} opacity={0.6} fontFamily={DL.fontMono} fontSize={9} letterSpacing="2.4">TYPES</text>
                <text x={STEP_X} y={12} textAnchor="middle" fill={DL.gold} opacity={0.6} fontFamily={DL.fontMono} fontSize={9} letterSpacing="2.4">LIFECYCLE STEPS</text>
                <text x={OUT_X}  y={12} textAnchor="middle" fill={DL.gold} opacity={0.6} fontFamily={DL.fontMono} fontSize={9} letterSpacing="2.4">OUTCOMES</text>

                {/* Phase bands (subtle rounded rects behind step column) */}
                <g opacity={0.15}>
                    <rect x={STEP_X - 130} y={50}  width={260} height={280} rx={12} fill="none" stroke={DL.gold} strokeDasharray="2 4" />
                    <rect x={STEP_X - 130} y={395} width={260} height={95}  rx={12} fill="none" stroke={DL.gold} strokeDasharray="2 4" />
                    <rect x={STEP_X - 130} y={545} width={260} height={155} rx={12} fill="none" stroke={DL.gold} strokeDasharray="2 4" />
                </g>
                <g fill="rgba(251,248,241,0.35)" fontFamily={DL.fontMono} fontSize={8} letterSpacing="1.8">
                    <text x={STEP_X} y={45} textAnchor="middle">PRE-TOURNAMENT</text>
                    <text x={STEP_X} y={390} textAnchor="middle">IN TOURNAMENT</text>
                    <text x={STEP_X} y={540} textAnchor="middle">POST-TOURNAMENT</text>
                </g>

                {/* Type → Step edges */}
                <g>
                    {IN_EDGES.map(([tId, sId, owner], i) => {
                        const t = typeById(tId), s = stepById(sId);
                        const active = pulsePath && pulsePath.t === tId && pulsePath.s === sId;
                        const d = `M${TYPE_X + 18},${t.y} C${(TYPE_X + STEP_X) / 2},${t.y} ${(TYPE_X + STEP_X) / 2},${s.y} ${STEP_X - 18},${s.y}`;
                        return <path key={`in-${i}`} d={d} style={edgeStyle(owner, active)} />;
                    })}
                </g>
                {/* Step → Outcome edges */}
                <g>
                    {OUT_EDGES.map(([sId, oId, tone], i) => {
                        const s = stepById(sId), o = outById(oId);
                        const active = pulsePath && pulsePath.s === sId && pulsePath.o === oId;
                        const d = `M${STEP_X + 18},${s.y} C${(STEP_X + OUT_X) / 2},${s.y} ${(STEP_X + OUT_X) / 2},${o.y} ${OUT_X - 18},${o.y}`;
                        return <path key={`out-${i}`} d={d} style={edgeStyle(tone, active)} />;
                    })}
                </g>

                {/* Type nodes */}
                <g>
                    {TYPES.map(t => {
                        const active = pulsePath && pulsePath.t === t.id;
                        return (
                            <g key={t.id} transform={`translate(${TYPE_X},${t.y})`}>
                                <circle r={active ? 12 : 8} fill={t.owner === "m" ? DL.gold : "#C9A45F"} opacity={active ? 1 : 0.85} style={{ transition: "r 300ms ease, opacity 300ms ease" }} />
                                <circle r={4} fill={DL.paper} opacity={0.9} />
                                <text x={-24} y={-2} textAnchor="end" fill={DL.paper} fontFamily={DL.fontBody} fontSize={11.5} fontWeight={700}>{t.label}</text>
                                <text x={-24} y={12} textAnchor="end" fill="rgba(251,248,241,0.5)" fontFamily={DL.fontMono} fontSize={8.5}>{t.steps}</text>
                            </g>
                        );
                    })}
                </g>

                {/* Step nodes */}
                <g>
                    {STEPS.map(s => {
                        const active = pulsePath && pulsePath.s === s.id;
                        return (
                            <g key={s.id} transform={`translate(${STEP_X},${s.y})`}>
                                <circle r={active ? 15 : 10} fill={DL.emerald} stroke={DL.gold} strokeWidth={active ? 2 : 1} opacity={active ? 1 : 0.9} style={{ transition: "r 300ms ease" }} />
                                <circle r={5} fill={DL.paper} opacity={active ? 1 : 0.5} />
                                <text x={20} y={2} fill={DL.paper} fontFamily={DL.fontBody} fontSize={11} fontWeight={active ? 700 : 500} style={{ transition: "font-weight 300ms" }}>{s.label}</text>
                            </g>
                        );
                    })}
                </g>

                {/* Outcome nodes */}
                <g>
                    {OUTCOMES.map(o => {
                        const active = pulsePath && pulsePath.o === o.id;
                        return (
                            <g key={o.id} transform={`translate(${OUT_X},${o.y})`}>
                                <circle r={active ? 14 : 10} fill={ownerColor(o.tone)} opacity={active ? 1 : 0.9} style={{ transition: "r 300ms ease" }} />
                                <circle r={5} fill={DL.paper} opacity={0.9} />
                                <text x={20} y={-2} fill={DL.paper} fontFamily={DL.fontBody} fontSize={11.5} fontWeight={700}>{o.label}</text>
                                <text x={20} y={12} fill="rgba(251,248,241,0.5)" fontFamily={DL.fontMono} fontSize={8.5}>{o.sub}</text>
                            </g>
                        );
                    })}
                </g>

                {/* Firing dot travels along the pulse path */}
                {pulsePath && (
                    <g key={`pulse-${pulseKey}`}>
                        {[
                            [TYPE_X, typeById(pulsePath.t).y, STEP_X, stepById(pulsePath.s).y, "0s"],
                            [STEP_X, stepById(pulsePath.s).y, OUT_X, outById(pulsePath.o).y, "1.2s"],
                        ].map(([x1, y1, x2, y2, delay], i) => (
                            <circle key={i} r={4} fill={DL.gold} opacity={0}
                                style={{
                                    filter: `drop-shadow(0 0 8px ${DL.gold})`,
                                }}
                            >
                                <animate attributeName="opacity" values="0;1;1;0" dur="1.2s" begin={delay} fill="freeze" />
                                <animate attributeName="cx" from={x1 + 18} to={x2 - 18} dur="1.2s" begin={delay} fill="freeze" />
                                <animate attributeName="cy" from={y1} to={y2} dur="1.2s" begin={delay} fill="freeze" />
                            </circle>
                        ))}
                    </g>
                )}
            </svg>

            {/* footer stat strip */}
            <div style={{
                position: "absolute", bottom: 22, left: 32, right: 32, zIndex: 3,
                display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 18,
                color: "rgba(251,248,241,0.75)", fontFamily: DL.fontMono, fontSize: 10, letterSpacing: "0.14em",
                borderTop: "1px solid rgba(184,131,40,0.28)", paddingTop: 12,
            }}>
                <div style={{ display: "flex", gap: 22 }}>
                    {[
                        ["8", "types"], ["10", "steps"], ["62", "live wires"], ["49", "mandatory"],
                    ].map(([n, l]) => (
                        <div key={l} style={{ textAlign: "left" }}>
                            <div style={{ color: DL.gold, fontFamily: DL.fontDisplay, fontSize: 20, fontWeight: 800, lineHeight: 1 }}>{n}</div>
                            <div style={{ textTransform: "uppercase", fontSize: 9, marginTop: 2, opacity: 0.7 }}>{l}</div>
                        </div>
                    ))}
                </div>
                <div style={{ color: DL.gold, opacity: 0.65, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.2em" }}>
                    Live · fires every 3.2s
                </div>
            </div>
        </div>
    );
}
