/**
 * Sprint M19 · Tournament Type Catalog
 * ─────────────────────────────────────
 * 11 tournament types extracted from the MPCA tournament utility (HTML).
 * Used by the two-step Create-Tournament flow — Step 1 shows this catalog,
 * Step 2 collects basic name/season/host/dates and creates the tournament
 * with `tournament_type_code` set for downstream input-variable forms.
 */

/**
 * Sprint M22 · Tournament Type Catalog with RBAC classification
 *
 * `created_by`  — which body-type persona is allowed to CREATE this type.
 *                 MPCA-level personas ("State") vs Division/District personas.
 * `section`     — grouping in the type-picker per user's mockup:
 *                 "BCCI ALLOTS TO MPCA"
 *                 "MPCA ALLOTS TO DIVISION"
 *                 "A DIVISION ALLOTS TO ITS DISTRICTS, CLUBS, SCHOOLS OR ITS OWN TEAMS"
 * `flow`        — origin → recipient hint ("BCCI → MPCA", "MPCA → Division",
 *                 "Division → District", etc.), rendered as a chip on each card.
 *
 * Rule per user brief (screenshot):
 *   MPCA-level personas create: bcci_staging, away_participation, inter_div
 *   Division/District personas create: everything else (8 types)
 */
export const TOURNAMENT_TYPE_CATALOG = [
    {
        code: "bcci_staging",
        scheme_code: "9-BCCI",
        name: "BCCI Domestic Tournament (Staging)",
        family: "BCCI",
        default_format: "FiveDay",
        default_scope: "Championship",
        one_liner: "Allotted by BCCI under the rotation format and staged by MPCA at Indore or Gwalior. Hosting fee and participation subsidy are receivable from BCCI; all staging arrangements are the host association's cost.",
        input_hint: "Host fee ₹1.75L/day multi-day, ₹3.5-4.5L limited-overs; cars, anti-doping room.",
        eligible_hosts: ["MPCA"],
        created_by: ["State"],                       // MPCA only
        section: "BCCI ALLOTS TO MPCA",
        flow: "BCCI → MPCA",
        scheme_ref: "BCCI Guidelines to Staging Associations 2025-26",
    },
    {
        code: "away_participation",
        scheme_code: "9-BCCI",
        name: "BCCI Away Participation (MP Team)",
        family: "BCCI",
        default_format: "FiveDay",
        default_scope: "Championship",
        one_liner: "The MP team travelling to another state for a BCCI fixture. Participation subsidy is receivable per match; the travelling squad's own travel, hotel and allowances are billed to MPCA, so a tour runs at a net cost.",
        input_hint: "Air/rail fare + hotel ₹3.4k/night + ₹500/day allowance + subsidy receivable.",
        eligible_hosts: ["MPCA"],
        created_by: ["State"],                       // MPCA only
        section: "BCCI ALLOTS TO MPCA",
        flow: "BCCI → MPCA",
        scheme_ref: "BCCI Guidelines cl.1B and cl.13",
    },
    {
        code: "inter_div",
        scheme_code: "2-D",
        name: "MPCA Inter-Divisional Tournament",
        family: "MPCA_InterDivisional",
        default_format: "Multi_Day",
        default_scope: "Inter_Divisional",
        one_liner: "Allotted by MPCA under the CDC / Tournament Committee calendar and hosted by a Division. MPCA funds hosting on the parameters at pp.11-13 of the scheme.",
        input_hint: "Pools & hosts, days per match, knockout structure, prize incentives.",
        eligible_hosts: ["MPCA"],
        created_by: ["State"],                       // MPCA only (allots)
        section: "MPCA ALLOTS TO DIVISION",
        flow: "MPCA → Division",
        scheme_ref: "Scheme pp.11-13",
    },
    // ─────────── DIVISION-CREATED (7 types) ───────────
    // NOTE: `inter_div_travel` (Travel Subsidy) moved OUT of this group and
    // into the MPCA-created section below — Divisions never create it; MPCA
    // creates it in parallel with each Inter-Divisional tournament so the
    // Division participants can claim their III-tier AC rail fare against
    // the parallel tournament instead of the main Inter-Div fixture.
    // MPCA-123 · "Visiting Grant" (Travel Subsidy) is no longer a standalone
    // creatable type — it is auto-attached to Inter-Divisional and
    // Inter-District tournaments via `visiting_scheme_code = "2-C"` (M39l).
    // Kept in the catalog for legacy lookups but with `created_by: []` so it
    // never appears in the New Tournament picker.
    {
        code: "inter_div_travel",
        scheme_code: "2-C",
        name: "Inter-Divisional Participation (Travel Subsidy)",
        family: "MPCA_InterDivisional",
        default_format: "Multi_Day",
        default_scope: "Inter_Divisional",
        one_liner: "Auto-attached to Inter-Divisional / Inter-District tournaments — visiting Divisions/Districts claim III-tier AC rail fare against the parent tournament via scheme 2-C.",
        input_hint: "III-tier AC rail fare, feeder legs from District HQ, Tatkal premium.",
        eligible_hosts: ["MPCA"],
        created_by: [],                              // MPCA-123 · no longer standalone-creatable
        section: "MPCA ALLOTS TO DIVISION",
        flow: "MPCA → Division",
        scheme_ref: "Scheme p.10",
    },
    {
        code: "pre_camp",
        scheme_code: "3-D",
        name: "Pre-Tournament Camp (Divisional Team)",
        family: "MPCA_InterDivisional",
        default_format: "Multi_Day",
        default_scope: "Inter_Divisional",
        one_liner: "Camp held by a Division for the team going to an MPCA inter-divisional tournament. Eight days maximum, including reporting and departure.",
        input_hint: "Camp days ≤ 8, players 18-20, coach + trainer honoraria, medical actuals.",
        eligible_hosts: ["Division"],
        created_by: ["Division", "District"],
        section: "A DIVISION ALLOTS TO ITS DISTRICTS, CLUBS, SCHOOLS OR ITS OWN TEAMS",
        flow: "Division → Divisional team",
        scheme_ref: "Scheme p.19",
    },
    {
        code: "reciprocal",
        scheme_code: "3-C",
        name: "Reciprocal Matches Between Divisions",
        family: "MPCA_InterDivisional",
        default_format: "Multi_Day",
        default_scope: "Inter_Divisional",
        one_liner: "Arranged between two Divisions for match exposure. These days form part of the pre-tournament camp — camp and reciprocal matches together cannot exceed eight days.",
        input_hint: "Total camp+reciprocal days ≤ 8, host claims stay + food + officials.",
        eligible_hosts: ["Division"],
        created_by: ["Division", "District"],
        section: "A DIVISION ALLOTS TO ITS DISTRICTS, CLUBS, SCHOOLS OR ITS OWN TEAMS",
        flow: "Division → Division",
        scheme_ref: "Scheme p.18",
    },
    {
        code: "inter_district",
        scheme_code: "2-B",
        name: "Inter-District Tournament",
        family: "MPCA_InterDivisional",
        default_format: "Multi_Day",
        default_scope: "Inter_District",
        one_liner: "Conducted by a Division within its own area to select the divisional team. Every Division must hold one. Subsidy is capped per match day on the travel profile of the fixture.",
        input_hint: "Per-day ceilings (INR 28k one-team, 39k both-teams), umpires, ground rent.",
        eligible_hosts: ["Division"],
        created_by: ["Division", "District"],
        section: "A DIVISION ALLOTS TO ITS DISTRICTS, CLUBS, SCHOOLS OR ITS OWN TEAMS",
        flow: "Division → District",
        scheme_ref: "Scheme pp.8-9",
    },
    {
        code: "inter_school",
        scheme_code: "2-A",
        name: "Inter-School Tournament",
        family: "Invitational",
        default_format: "One_Day",
        default_scope: "Inter_District",
        one_liner: "Knockout tournament for schools that promote cricket through the year. Entry fee is collected by the host and declared with the claim.",
        input_hint: "25 ov (till SF), 50 ov (SF+F), ₹5k grant/day, entry fee ₹1.5k/team.",
        eligible_hosts: ["Division", "District"],
        created_by: ["Division", "District"],
        section: "A DIVISION ALLOTS TO ITS DISTRICTS, CLUBS, SCHOOLS OR ITS OWN TEAMS",
        flow: "Division → Schools",
        scheme_ref: "Scheme p.7",
    },
    {
        code: "inter_club",
        scheme_code: "2-E",
        name: "Inter-Club Tournament ('A' Grade Clubs)",
        family: "Invitational",
        default_format: "Multi_Day",
        default_scope: "Inter_District",
        one_liner: "Two-day knockout invitation tournament for 'A' grade clubs. One-day matches and league-cum-knockout formats are not reimbursed.",
        input_hint: "Only two-day knockout reimbursed; outstation clubs get stay+food+travel.",
        eligible_hosts: ["Division"],
        created_by: ["Division", "District"],
        section: "A DIVISION ALLOTS TO ITS DISTRICTS, CLUBS, SCHOOLS OR ITS OWN TEAMS",
        flow: "Division → 'A' grade clubs",
        scheme_ref: "Scheme pp.14-15",
    },
    {
        code: "coaching_camp",
        scheme_code: "3-A",
        name: "Periodical Coaching Camp (District Players)",
        family: "MPCA_InterDivisional",
        default_format: "Multi_Day",
        default_scope: "Inter_District",
        one_liner: "A fortnight's camp for players from district and rural places who cannot practise at the divisional headquarters. Not available for the camp before an inter-divisional tournament.",
        input_hint: "Camp days ~14, ₹15k misc cap, prior MPCA notification mandatory.",
        eligible_hosts: ["Division"],
        created_by: ["Division", "District"],
        section: "A DIVISION ALLOTS TO ITS DISTRICTS, CLUBS, SCHOOLS OR ITS OWN TEAMS",
        flow: "Division → District players",
        scheme_ref: "Scheme p.16",
    },
    {
        code: "vacation_camp",
        scheme_code: "3-B",
        name: "Vacation Camp",
        family: "MPCA_InterDivisional",
        default_format: "Multi_Day",
        default_scope: "Inter_District",
        one_liner: "A two to three week summer camp. The Divisional Secretary must certify that no amount was charged from the players.",
        input_hint: "Free of charge to players — Secretary's undertaking required.",
        eligible_hosts: ["Division"],
        created_by: ["Division", "District"],
        section: "A DIVISION ALLOTS TO ITS DISTRICTS, CLUBS, SCHOOLS OR ITS OWN TEAMS",
        flow: "Division → Players",
        scheme_ref: "Scheme p.17",
    },
];

export const getTypeByCode = (code) => TOURNAMENT_TYPE_CATALOG.find((t) => t.code === code) || null;

/**
 * Filter the catalog to only types a persona is allowed to CREATE, per the
 * user's RBAC rule (screenshot):
 *   MPCA (body_type=State) → BCCI staging, Away participation, MPCA Inter-Div (3 types)
 *   Division/District      → the remaining 8 types
 *   Any other persona      → nothing (returns empty array)
 */
export const getCreatableTournamentTypes = (persona) => {
    const bt = persona?.body_type;
    if (!bt) return [];
    return TOURNAMENT_TYPE_CATALOG.filter((t) => (t.created_by || []).includes(bt));
};

/**
 * Group a catalog subset by their `section` label so the type picker can
 * render the visual sections shown in the user's mockup.
 */
export const groupTypesBySection = (types) => {
    const out = {};
    for (const t of types) {
        const s = t.section || "Other";
        (out[s] = out[s] || []).push(t);
    }
    // Preserve the order MPCA → BCCI → Division sections
    const order = [
        "BCCI ALLOTS TO MPCA",
        "MPCA ALLOTS TO DIVISION",
        "A DIVISION ALLOTS TO ITS DISTRICTS, CLUBS, SCHOOLS OR ITS OWN TEAMS",
    ];
    const ordered = {};
    for (const s of order) if (out[s]) ordered[s] = out[s];
    for (const s of Object.keys(out)) if (!ordered[s]) ordered[s] = out[s];
    return ordered;
};

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
