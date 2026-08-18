/**
 * MPCA-254 · Ship A · Wiring Compliance chip
 * ─────────────────────────────────────────────
 * Classifies a tournament (or a tournament type catalog entry) as either:
 *   🟢 Wired · Following Governance — has `tournament_type_code` that
 *      resolves to a known wiring type_id (bcci · interdiv · district ·
 *      interschool · interclub · camp · coachingcamp · vacationcamp).
 *   🟡 Wired · Legacy Flow — tournament pre-dates wiring or has no
 *      `tournament_type_code` set. Still functional, but not covered by
 *      the 80-cell wiring matrix.
 *
 * Definition lives here so all consumers (type picker, tournament list,
 * detail header) agree.
 */

// Mirror of backend routes/tournament_wiring_status._CODE_TO_TYPE — the
// canonical set of `tournament_type_code` prefixes the wiring engine can
// resolve. Kept small so it's obvious what "wired" means.
const WIRED_CODE_PREFIXES = [
    "bcci",
    "ranji",
    "vijay_hazare",
    "syed_mushtaq_ali",
    "duleep",
    "irani",
    "nayudu",
    "inter_div",
    "mpca_inter_div",
    "inter_district",
    "inter_school",
    "school",
    "inter_club",
    "club",
    "coaching_camp",
    "periodical_coaching_camp",
    "vacation_camp",
    "pre_tournament_camp",
    "pre_camp",
];

/** True if `tournament_type_code` resolves to a wiring type_id. */
export const isWiredCode = (code) => {
    if (!code) return false;
    const lc = String(code).toLowerCase();
    return WIRED_CODE_PREFIXES.some((p) => lc.startsWith(p));
};

/** Given a tournament document, decide wired vs legacy. */
export const wiringComplianceOfTournament = (t) => {
    if (!t) return { wired: false, label: "Wired · Legacy Flow", tone: "amber", tip: "Tournament has no tournament_type_code — created before the wiring engine." };
    if (isWiredCode(t.tournament_type_code)) {
        return {
            wired: true,
            label: "Wired · Following Governance",
            tone: "green",
            tip: `Type code '${t.tournament_type_code}' resolves via the 80-cell wiring matrix. Every mutation is governed by wiring_guard.`,
        };
    }
    // Fallbacks that still qualify as wired (backend `_resolve_type_id` uses
    // them): BCCI flag or Inter-Divisional / Inter-District scope.
    if (t.tournament_type === "BCCI" || t.scope === "Inter_Divisional" || t.scope === "Inter_District") {
        return {
            wired: true,
            label: "Wired · Following Governance",
            tone: "green",
            tip: "Wiring resolved via tournament scope/type flag (no explicit type code, but the engine can still route it).",
        };
    }
    return {
        wired: false,
        label: "Wired · Legacy Flow",
        tone: "amber",
        tip: "Tournament predates the wiring engine — mutations fall back to MPCA-only defaults. Consider re-tagging with a tournament_type_code.",
    };
};

/** Chip renderer — small green/amber pill with dot + label. */
export const WiringComplianceChip = ({ tournament, code, className = "", showLabel = true, testId }) => {
    // Support two call shapes: (a) tournament doc, (b) raw catalog code.
    const info = tournament
        ? wiringComplianceOfTournament(tournament)
        : (isWiredCode(code)
            ? { wired: true,  label: "Wired · Following Governance", tone: "green", tip: "This tournament type is fully wired." }
            : { wired: false, label: "Wired · Legacy Flow",          tone: "amber", tip: "This tournament type is not yet in the wiring matrix." });

    const tones = {
        green: {
            border: "border-mpca-green-dark/50",
            bg:     "bg-mpca-green-dark/10",
            text:   "text-mpca-green-dark",
            dot:    "bg-mpca-green-dark",
        },
        amber: {
            border: "border-mpca-brass/60",
            bg:     "bg-mpca-brass/10",
            text:   "text-mpca-brass",
            dot:    "bg-mpca-brass",
        },
    };
    const t = tones[info.tone];
    return (
        <span
            title={info.tip}
            data-testid={testId || "wiring-chip"}
            className={`inline-flex items-center gap-1 px-2 py-0.5 border text-[10px] uppercase tracking-widest ${t.border} ${t.bg} ${t.text} ${className}`}
        >
            <span className={`w-1.5 h-1.5 rounded-full ${t.dot}`} />
            {showLabel && info.label}
        </span>
    );
};

export default WiringComplianceChip;
