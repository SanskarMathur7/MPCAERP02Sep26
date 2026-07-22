/**
 * Sprint M19 · Tournament Type Catalog
 * ─────────────────────────────────────
 * 11 tournament types extracted from the MPCA tournament utility (HTML).
 * Used by the two-step Create-Tournament flow — Step 1 shows this catalog,
 * Step 2 collects basic name/season/host/dates and creates the tournament
 * with `tournament_type_code` set for downstream input-variable forms.
 */

export const TOURNAMENT_TYPE_CATALOG = [
    {
        code: "inter_div",
        scheme_code: "2-B",
        name: "MPCA Inter-Divisional Tournament",
        family: "MPCA_InterDivisional",
        default_format: "Multi_Day",
        default_scope: "Inter_Divisional",
        icon: "trophy",
        one_liner: "State-level trophies played between MPCA Divisions (MY Memorial, Madhavrao Scindia, JN Bhaya).",
        input_hint: "Pools & hosts, days per match, knockout structure, prize incentives.",
        eligible_hosts: ["MPCA", "Division"],
    },
    {
        code: "inter_district",
        scheme_code: "2-A",
        name: "Inter-District Tournament",
        family: "MPCA_InterDivisional",
        default_format: "Multi_Day",
        default_scope: "Inter_District",
        icon: "shield",
        one_liner: "Compulsory Division-level tournament between constituent Districts.",
        input_hint: "Per-day ceilings (INR 28k one-team, 39k both-teams), umpires, ground rent.",
        eligible_hosts: ["Division"],
    },
    {
        code: "inter_div_travel",
        scheme_code: "2-C",
        name: "Inter-Divisional Participation (Travel Subsidy)",
        family: "MPCA_InterDivisional",
        default_format: "Multi_Day",
        default_scope: "Inter_Divisional",
        icon: "route",
        one_liner: "Travel subsidy claim when a Division plays away in an MPCA Inter-Divisional tournament.",
        input_hint: "III-tier AC rail fare, feeder legs from District HQ, Tatkal premium.",
        eligible_hosts: ["Division"],
    },
    {
        code: "pre_camp",
        scheme_code: "3-D",
        name: "Pre-Tournament Camp (Divisional Team)",
        family: "MPCA_InterDivisional",
        default_format: "Multi_Day",
        default_scope: "Inter_Divisional",
        icon: "dumbbell",
        one_liner: "8-day camp ahead of an Inter-Divisional tournament (league or knockout stage).",
        input_hint: "Camp days ≤ 8, players 18-20, coach + trainer honoraria, medical actuals.",
        eligible_hosts: ["Division"],
    },
    {
        code: "reciprocal",
        scheme_code: null,   // uses fallback / actuals
        name: "Reciprocal Matches Between Divisions",
        family: "MPCA_InterDivisional",
        default_format: "Multi_Day",
        default_scope: "Inter_Divisional",
        icon: "arrow-left-right",
        one_liner: "Bilateral 2-day matches between two Divisions in a specific age group.",
        input_hint: "Total camp+reciprocal days ≤ 8, host claims stay + food + officials.",
        eligible_hosts: ["Division"],
    },
    {
        code: "coaching_camp",
        scheme_code: "3-A",
        name: "Periodical Coaching Camp (District Players)",
        family: "MPCA_InterDivisional",
        default_format: "Multi_Day",
        default_scope: "Inter_District",
        icon: "notebook-pen",
        one_liner: "Two-week coaching camp for district-level players run by a Division.",
        input_hint: "Camp days ~14, ₹15k misc cap, prior MPCA notification mandatory.",
        eligible_hosts: ["Division"],
    },
    {
        code: "vacation_camp",
        scheme_code: null,
        name: "Vacation Camp",
        family: "MPCA_InterDivisional",
        default_format: "Multi_Day",
        default_scope: "Inter_District",
        icon: "sun",
        one_liner: "Vacation-window camp (typically 2-3 weeks) with outstation + local players.",
        input_hint: "Free of charge to players — Secretary's undertaking required.",
        eligible_hosts: ["Division"],
    },
    {
        code: "inter_school",
        scheme_code: null,
        name: "Inter-School Tournament",
        family: "Invitational",
        default_format: "One_Day",
        default_scope: "Inter_District",
        icon: "graduation-cap",
        one_liner: "Boys/Girls knockout — up to 12 schools at Div HQ, 8 at a District.",
        input_hint: "25 ov (till SF), 50 ov (SF+F), ₹5k grant/day, entry fee ₹1.5k/team.",
        eligible_hosts: ["Division", "District"],
    },
    {
        code: "inter_club",
        scheme_code: null,
        name: "Inter-Club Tournament ('A' Grade)",
        family: "Invitational",
        default_format: "Multi_Day",
        default_scope: "Inter_District",
        icon: "flag",
        one_liner: "Two-day knockout among 10-12 'A' grade clubs of a Division.",
        input_hint: "Only two-day knockout reimbursed; outstation clubs get stay+food+travel.",
        eligible_hosts: ["Division"],
    },
    {
        code: "bcci_staging",
        scheme_code: "2-D",
        name: "BCCI Domestic Tournament (Staging)",
        family: "BCCI",
        default_format: "FiveDay",
        default_scope: "Championship",
        icon: "shield-check",
        one_liner: "Hosting a BCCI tournament (Ranji, CK Nayudu, U-19 etc.) at an MPCA venue.",
        input_hint: "Host fee ₹1.75L/day multi-day, ₹3.5-4.5L limited-overs; cars, anti-doping room.",
        eligible_hosts: ["MPCA", "Division"],
    },
    {
        code: "away_participation",
        scheme_code: null,
        name: "BCCI Away Participation (MP Team)",
        family: "BCCI",
        default_format: "FiveDay",
        default_scope: "Championship",
        icon: "plane",
        one_liner: "MP team travelling to another State for a BCCI tournament.",
        input_hint: "Air/rail fare + hotel ₹3.4k/night + ₹500/day allowance + subsidy receivable.",
        eligible_hosts: ["MPCA"],
    },
];

export const getTypeByCode = (code) => TOURNAMENT_TYPE_CATALOG.find((t) => t.code === code) || null;

/**
 * Fallback input specs for the 5 tournament categories that don't map to an
 * existing scheme calculator (`scheme_code: null`). Variables are still
 * recorded on the tournament document for record-keeping, but no auto-budget
 * is computed — the Division fills a manual budget in the Budget & Extras
 * screen.
 */
export const INLINE_INPUT_SPECS = {
    // Reciprocal Matches Between Divisions — HTML §2.6
    reciprocal: [
        { key: "opponent_division", label: "Opponent Division", type: "text", default: "" },
        { key: "age_group", label: "Age group", type: "select", options: ["Senior", "U-23", "U-19", "U-16", "U-14"], default: "Senior" },
        { key: "camp_days", label: "Camp days at host", default: 4, unit: "days" },
        { key: "match_days", label: "Reciprocal match days (≤ 2)", default: 2, unit: "days" },
        { key: "visiting_pax", label: "Visiting team pax", default: 18, unit: "pax" },
        { key: "host_pax", label: "Host team pax", default: 18, unit: "pax" },
        { key: "umpires_per_day", label: "Umpires per day", default: 2, unit: "officials" },
        { key: "hotel_per_day_per_room", label: "Hotel per day per room (₹)", default: 3400 },
    ],
    // Inter-School Tournament — HTML §2.8
    inter_school: [
        { key: "school_count", label: "Number of schools", default: 12, hint: "Up to 12 at Div HQ, 8 at District" },
        { key: "match_days", label: "Total match-days", default: 6, unit: "days" },
        { key: "overs_per_match_league", label: "Overs per match (league)", default: 25, unit: "ov" },
        { key: "overs_per_match_knockout", label: "Overs per match (SF+F)", default: 50, unit: "ov" },
        { key: "grant_per_day", label: "Per-day grant (₹)", default: 5000 },
        { key: "entry_fee_per_team", label: "Entry fee per team (₹)", default: 1500 },
        { key: "umpires_per_day", label: "Umpires per day", default: 2, unit: "officials" },
    ],
    // Inter-Club Tournament — HTML §2.9
    inter_club: [
        { key: "club_count", label: "Number of clubs (A-grade only)", default: 10, hint: "10-12 clubs typical" },
        { key: "knockout_days", label: "Two-day knockout days (only these reimbursed)", default: 2, unit: "days" },
        { key: "outstation_clubs", label: "Outstation clubs (need stay + travel)", default: 0, unit: "clubs" },
        { key: "outstation_pax_per_club", label: "Outstation pax per club", default: 15, unit: "pax" },
        { key: "hotel_per_day_per_room", label: "Hotel per day per room (₹)", default: 3400 },
        { key: "food_per_day_per_pax", label: "Food per day per pax (₹)", default: 350 },
        { key: "umpires_per_day", label: "Umpires per day", default: 2, unit: "officials" },
    ],
    // Vacation Camp — HTML §2.7
    vacation_camp: [
        { key: "camp_days", label: "Camp duration", default: 21, unit: "days", hint: "Typically 2-3 weeks" },
        { key: "total_pax", label: "Total participants", default: 25, unit: "pax" },
        { key: "outstation_pax", label: "Outstation participants", default: 10, unit: "pax" },
        { key: "coach_count", label: "Coaches", default: 2, unit: "pax" },
        { key: "trainer_count", label: "Trainers / physios", default: 1, unit: "pax" },
        { key: "secretary_undertaking", label: "Secretary undertaking on file?", type: "select", options: ["Yes", "No"], default: "No" },
    ],
    // BCCI Away Participation — HTML §2.11
    away_participation: [
        { key: "tournament_name", label: "BCCI tournament", type: "text", default: "" },
        { key: "travel_mode", label: "Travel mode", type: "select", options: ["Air", "Rail_AC2", "Rail_AC3"], default: "Rail_AC3" },
        { key: "team_pax", label: "Team pax (max 18)", default: 18, unit: "pax" },
        { key: "travel_days", label: "Travel days (both ways)", default: 2, unit: "days" },
        { key: "match_days", label: "Match days", default: 5, unit: "days" },
        { key: "hotel_per_night_per_room", label: "Hotel per night per room (₹)", default: 3400 },
        { key: "allowance_per_pax_per_day", label: "Daily allowance per pax (₹)", default: 500 },
        { key: "bcci_subsidy_receivable_inr", label: "BCCI subsidy receivable (₹)", default: 0, hint: "Net-off from MPCA claim" },
    ],
};
