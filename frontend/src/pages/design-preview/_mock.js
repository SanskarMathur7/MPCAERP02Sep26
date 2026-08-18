/**
 * Mock analytics data for /design-preview/* dashboards.
 * All figures are illustrative — the point is to validate the design language.
 */

export const DIVISIONS = [
    { code: "DIV-IND", name: "Indore" },
    { code: "DIV-BPL", name: "Bhopal" },
    { code: "DIV-GWL", name: "Gwalior" },
    { code: "DIV-JBP", name: "Jabalpur" },
    { code: "DIV-UJN", name: "Ujjain" },
    { code: "DIV-RTL", name: "Ratlam" },
    { code: "DIV-SGR", name: "Sagar" },
    { code: "DIV-RWA", name: "Rewa" },
    { code: "DIV-STN", name: "Satna" },
    { code: "DIV-SHM", name: "Shahdol" },
];

export const KPIS = {
    tournaments_active: 27,
    matches_today: 14,
    disbursed_ytd_cr: 42.7,
    active_claims: 68,
    officials_on_duty: 112,
    squads_finalised: 41,
};

export const LIVE_MATCHES = [
    { id: "M-1042", tourn: "Ranji · Elite", teams: "MP vs Karnataka", location: "Holkar, Indore", format: "MD", ovs: "68.4", score: "241/4", target: null, live: true },
    { id: "M-1043", tourn: "Parmanand Trophy", teams: "Indore vs Bhopal", location: "Emerald, Indore", format: "T20", ovs: "18.2", score: "162/6", target: 178, live: true },
    { id: "M-1044", tourn: "SMAT MP Zone", teams: "MP vs Baroda", location: "TCA, Trichy", format: "T20", ovs: "12.5", score: "94/2", target: null, live: true },
    { id: "M-1045", tourn: "U-19 Cooch Behar", teams: "MP-U19 vs Vidarbha-U19", location: "Rewa", format: "MD", ovs: "42.1", score: "156/3", target: null, live: true },
    { id: "M-1046", tourn: "MY Memorial", teams: "Ujjain vs Gwalior", location: "Ujjain", format: "50-OV", ovs: "36.4", score: "203/5", target: null, live: true },
];

export const TICKER = [
    "TOSS · Ranji Elite · MP won toss, elected to bat",
    "MP 241/4 (68.4) · Karnataka trail by 132",
    "Injury update · Puneet Datey ruled out — subs incoming",
    "Grant sanctioned · ₹18.4L disbursed to DIV-BPL",
    "Budget alert · DIV-GWL 92% utilisation on Match Officials",
    "Officials · 3 umpires deployed to SMAT tomorrow",
    "Squad locked · MP-U19 for Cooch Behar quarter",
    "Fixture · MY Memorial semis on Feb 24 @ Indore",
];

export const UPCOMING_TOSSES = [
    { tourn: "Ranji · Plate", teams: "MP vs Chhattisgarh", when_min: 42, venue: "Kolar, Bhopal" },
    { tourn: "Vijay Hazare", teams: "MP vs Assam", when_min: 118, venue: "Emerald, Indore" },
    { tourn: "SMAT · MP Zone", teams: "MP vs Baroda", when_min: 210, venue: "TCA, Trichy" },
];

/* ---------- Grants kanban -------------------------------------------- */
export const GRANT_STAGES = [
    { key: "Draft", label: "Draft", color: "#64748B", count: 6, sum_cr: 0.8 },
    { key: "Documents_Pending", label: "Docs Pending", color: "#FFB703", count: 14, sum_cr: 2.1 },
    { key: "Submitted", label: "Submitted", color: "#00B4D8", count: 11, sum_cr: 1.7 },
    { key: "Under_Review", label: "Under Review", color: "#FF8A00", count: 9, sum_cr: 3.4 },
    { key: "Approved", label: "Approved", color: "#2A9D8F", count: 12, sum_cr: 5.2 },
    { key: "Payment_Made", label: "Payment Made", color: "#0EA37E", count: 16, sum_cr: 8.6 },
];

export const GRANT_CARDS = [
    { stage: "Documents_Pending", body: "DIV-IND", scheme: "Travel Grant", amount_l: 18.4, age_days: 4 },
    { stage: "Documents_Pending", body: "DIV-BPL", scheme: "Coaching Camp Grant", amount_l: 9.2, age_days: 11 },
    { stage: "Documents_Pending", body: "DIV-GWL", scheme: "Match Fee Reimbursement", amount_l: 6.8, age_days: 6 },
    { stage: "Submitted", body: "DIV-UJN", scheme: "Kit Grant", amount_l: 4.4, age_days: 2 },
    { stage: "Submitted", body: "DIV-JBP", scheme: "Travel Grant", amount_l: 12.7, age_days: 8 },
    { stage: "Under_Review", body: "DIV-RTL", scheme: "Coaching Camp Grant", amount_l: 22.9, age_days: 14 },
    { stage: "Under_Review", body: "DIV-SGR", scheme: "Match Officials DA", amount_l: 3.6, age_days: 19 },
    { stage: "Approved", body: "DIV-RWA", scheme: "Travel Grant", amount_l: 15.3, age_days: 3 },
    { stage: "Approved", body: "DIV-STN", scheme: "Kit Grant", amount_l: 4.1, age_days: 1 },
    { stage: "Payment_Made", body: "DIV-IND", scheme: "Match Fee Reimbursement", amount_l: 32.5, age_days: 0 },
    { stage: "Payment_Made", body: "DIV-SHM", scheme: "Travel Grant", amount_l: 7.8, age_days: 2 },
    { stage: "Draft", body: "DIV-BPL", scheme: "Kit Grant", amount_l: 2.1, age_days: 22 },
];

export const AGEING_BUCKETS = [
    { bucket: "0-3 d", count: 22 },
    { bucket: "4-7 d", count: 18 },
    { bucket: "8-14 d", count: 14 },
    { bucket: "15-21 d", count: 8 },
    { bucket: "21+ d", count: 6 },
];

/* ---------- Budget heads ---------------------------------------------- */
export const BUDGET_TREE = {
    name: "Season 2026-27",
    children: [
        { name: "Match Officials", value: 4.8, children: [
            { name: "Umpire Fee", value: 2.9 }, { name: "Referee Fee", value: 0.9 }, { name: "Scorer Fee", value: 0.6 }, { name: "Video Analyst", value: 0.4 },
        ]},
        { name: "Player Costs", value: 6.2, children: [
            { name: "DA / TA", value: 2.4 }, { name: "Match Fees", value: 2.1 }, { name: "Kit", value: 1.1 }, { name: "Insurance", value: 0.6 },
        ]},
        { name: "Ground & Ops", value: 3.9, children: [
            { name: "Ground Rent", value: 1.6 }, { name: "Pitch Prep", value: 0.9 }, { name: "Security", value: 0.7 }, { name: "Ambulance", value: 0.4 }, { name: "Refreshments", value: 0.3 },
        ]},
        { name: "Travel & Stay", value: 5.1, children: [
            { name: "Team Travel", value: 2.2 }, { name: "Hotel", value: 2.4 }, { name: "Local Transport", value: 0.5 },
        ]},
        { name: "Coaching Camp", value: 2.7, children: [
            { name: "Coach Honoraria", value: 1.1 }, { name: "Camp Kit", value: 0.6 }, { name: "Nutrition", value: 0.5 }, { name: "Physio", value: 0.5 },
        ]},
        { name: "Grants Out", value: 8.1, children: [
            { name: "Division Grants", value: 5.3 }, { name: "District Grants", value: 2.1 }, { name: "Ad-hoc", value: 0.7 },
        ]},
    ],
};
export const BUDGET_UTILISATION = 0.74;
export const TOP_OVERRUNS = [
    { head: "Umpire Fee · DIV-IND", pct: 118 },
    { head: "Hotel · DIV-BPL",       pct: 112 },
    { head: "Ground Rent · DIV-GWL", pct: 106 },
    { head: "Team Travel · DIV-JBP", pct: 104 },
    { head: "DA/TA · DIV-UJN",       pct: 101 },
];
export const INVOICE_VELOCITY = [7, 12, 9, 18, 22, 14, 26, 31, 24, 19, 28, 33];

/* ---------- Tournament calendar (annual heatmap) --------------------- */
export const MATCH_HEATMAP = (() => {
    // Generate a year of daily match counts (Apr-2026 to Mar-2027)
    const rows = [];
    const start = new Date(2026, 3, 1);
    for (let d = 0; d < 365; d++) {
        const day = new Date(start); day.setDate(day.getDate() + d);
        const m = day.getMonth();
        // seasonal shape: peak Oct-Feb, low Apr-Jun
        const base = [1, 2, 3, 6, 8, 9, 10, 11, 0].includes(m) ? 4 : 2;
        const value = Math.max(0, Math.round(base + Math.random() * 6 - 2));
        rows.push([day.toISOString().slice(0, 10), value]);
    }
    return rows;
})();
export const FORMAT_MIX = [
    { name: "T20",        value: 84,  color: "#FF8A00" },
    { name: "One Day",    value: 62,  color: "#00B4D8" },
    { name: "Multi-Day",  value: 41,  color: "#2A9D8F" },
    { name: "Pink Ball",  value: 6,   color: "#E63946" },
];
export const TOURNAMENT_GANTT = [
    { name: "Ranji Elite",       start: "2026-10-01", end: "2027-02-28", type: "BCCI" },
    { name: "Vijay Hazare",      start: "2026-11-15", end: "2026-12-30", type: "BCCI" },
    { name: "SMAT · MP Zone",    start: "2027-01-10", end: "2027-02-05", type: "BCCI" },
    { name: "MY Memorial",       start: "2026-09-10", end: "2026-11-05", type: "INTERDIV" },
    { name: "Madhavrao Scindia", start: "2026-10-20", end: "2026-12-10", type: "INTERDIV" },
    { name: "JN Bhaya",          start: "2026-11-01", end: "2026-12-15", type: "INTERDIV" },
    { name: "CS Nayudu Trophy",  start: "2026-12-05", end: "2027-01-25", type: "CHAMPIONSHIP" },
    { name: "Cooch Behar U-19",  start: "2026-11-20", end: "2027-01-30", type: "BCCI" },
];

/* ---------- Officials & squads --------------------------------------- */
export const OFFICIALS_SANKEY = {
    nodes: [
        { name: "MPCA Panel" }, { name: "BCCI Elite" }, { name: "BCCI Grade A" }, { name: "State" },
        { name: "Ranji" }, { name: "SMAT" }, { name: "Vijay Hazare" }, { name: "MY Memorial" }, { name: "Madhavrao Scindia" }, { name: "CS Nayudu" }, { name: "Cooch Behar U-19" },
        { name: "Indore" }, { name: "Bhopal" }, { name: "Gwalior" }, { name: "Jabalpur" }, { name: "Ujjain" },
    ],
    links: [
        { source: "MPCA Panel", target: "BCCI Elite", value: 6 },
        { source: "MPCA Panel", target: "BCCI Grade A", value: 14 },
        { source: "MPCA Panel", target: "State", value: 92 },
        { source: "BCCI Elite", target: "Ranji", value: 4 },
        { source: "BCCI Elite", target: "SMAT", value: 2 },
        { source: "BCCI Grade A", target: "Ranji", value: 6 },
        { source: "BCCI Grade A", target: "Vijay Hazare", value: 4 },
        { source: "BCCI Grade A", target: "Cooch Behar U-19", value: 4 },
        { source: "State", target: "MY Memorial", value: 28 },
        { source: "State", target: "Madhavrao Scindia", value: 22 },
        { source: "State", target: "CS Nayudu", value: 18 },
        { source: "State", target: "Cooch Behar U-19", value: 12 },
        { source: "State", target: "SMAT", value: 12 },
        { source: "MY Memorial", target: "Indore", value: 8 }, { source: "MY Memorial", target: "Bhopal", value: 6 }, { source: "MY Memorial", target: "Gwalior", value: 6 }, { source: "MY Memorial", target: "Jabalpur", value: 4 }, { source: "MY Memorial", target: "Ujjain", value: 4 },
        { source: "Madhavrao Scindia", target: "Indore", value: 6 }, { source: "Madhavrao Scindia", target: "Bhopal", value: 6 }, { source: "Madhavrao Scindia", target: "Gwalior", value: 5 }, { source: "Madhavrao Scindia", target: "Jabalpur", value: 3 }, { source: "Madhavrao Scindia", target: "Ujjain", value: 2 },
    ],
};
export const SQUAD_FUNNEL = [
    { name: "Registered", value: 620 },
    { name: "Trials",     value: 340 },
    { name: "Shortlist",  value: 180 },
    { name: "Probable",   value: 62 },
    { name: "Final Squad", value: 22 },
];
export const FITNESS_RADAR = [
    { name: "Senior Squad", value: [90, 82, 76, 88, 71, 84] },
    { name: "U-19 Squad",   value: [78, 91, 82, 74, 89, 80] },
    { name: "U-23 Squad",   value: [84, 88, 79, 82, 77, 86] },
];
export const FITNESS_DIMS = ["Yo-Yo", "Sprint 30m", "Broad Jump", "Bench", "Body Comp", "Endurance"];

/* ---------- Financial flow (BCCI → MPCA → Div → Dist → Clubs) -------- */
export const FINANCIAL_SANKEY = {
    nodes: [
        { name: "BCCI Central", depth: 0 }, { name: "MPCA Corpus", depth: 1 },
        { name: "DIV-IND", depth: 2 }, { name: "DIV-BPL", depth: 2 }, { name: "DIV-GWL", depth: 2 }, { name: "DIV-JBP", depth: 2 }, { name: "DIV-UJN", depth: 2 },
        { name: "Indore-City Dist", depth: 3 }, { name: "Bhopal-City Dist", depth: 3 }, { name: "Ratlam Dist", depth: 3 }, { name: "Sagar Dist", depth: 3 }, { name: "Rewa Dist", depth: 3 },
        { name: "Emerald CC", depth: 4 }, { name: "Kolar CC", depth: 4 }, { name: "Shivpuri CC", depth: 4 }, { name: "Katni CC", depth: 4 }, { name: "Satna CC", depth: 4 },
    ],
    links: [
        { source: "BCCI Central", target: "MPCA Corpus", value: 92 },
        { source: "MPCA Corpus", target: "DIV-IND", value: 21 }, { source: "MPCA Corpus", target: "DIV-BPL", value: 18 }, { source: "MPCA Corpus", target: "DIV-GWL", value: 15 }, { source: "MPCA Corpus", target: "DIV-JBP", value: 14 }, { source: "MPCA Corpus", target: "DIV-UJN", value: 12 },
        { source: "DIV-IND", target: "Indore-City Dist", value: 12 },
        { source: "DIV-BPL", target: "Bhopal-City Dist", value: 11 },
        { source: "DIV-JBP", target: "Katni CC", value: 3 }, { source: "DIV-JBP", target: "Sagar Dist", value: 6 },
        { source: "DIV-GWL", target: "Ratlam Dist", value: 5 }, { source: "DIV-UJN", target: "Rewa Dist", value: 4 },
        { source: "Indore-City Dist", target: "Emerald CC", value: 6 }, { source: "Bhopal-City Dist", target: "Kolar CC", value: 5 },
        { source: "Ratlam Dist", target: "Shivpuri CC", value: 2 }, { source: "Sagar Dist", target: "Satna CC", value: 2 },
    ],
};
export const CASH_MONTHLY = [
    { m: "Apr", in_cr: 8, out_cr: 3 }, { m: "May", in_cr: 4, out_cr: 5 }, { m: "Jun", in_cr: 6, out_cr: 4 },
    { m: "Jul", in_cr: 12, out_cr: 7 }, { m: "Aug", in_cr: 9, out_cr: 8 }, { m: "Sep", in_cr: 14, out_cr: 11 },
    { m: "Oct", in_cr: 18, out_cr: 15 }, { m: "Nov", in_cr: 22, out_cr: 19 }, { m: "Dec", in_cr: 16, out_cr: 21 },
    { m: "Jan", in_cr: 12, out_cr: 24 }, { m: "Feb", in_cr: 9, out_cr: 18 }, { m: "Mar", in_cr: 6, out_cr: 12 },
];

/* ---------- Compliance heatmap --------------------------------------- */
export const COMPLIANCE_TYPES = ["BCCI", "Inter-Div", "Inter-Dist", "Championship", "Inter-School", "Inter-Club", "Coaching Camp", "Pre-Tourn Camp"];
export const COMPLIANCE_STEPS = ["Creation", "Wiring", "Pool Setup", "Match Cal", "Squads", "Officials", "Budget", "Invoices", "Closure", "Grants"];
export const COMPLIANCE_CELLS = COMPLIANCE_TYPES.flatMap((_, y) =>
    COMPLIANCE_STEPS.map((_, x) => {
        const r = Math.random();
        return [x, y, r > 0.85 ? 0 : r > 0.7 ? 1 : r > 0.4 ? 2 : 3];
    })
);
export const RED_FLAGS = [
    { title: "DIV-BPL · Ranji closure PDF missing signature", severity: "high", age: "5 d" },
    { title: "DIV-GWL · Match officials DA over 21-day TAT", severity: "high", age: "21 d" },
    { title: "DIV-JBP · Squad upload for U-19 not received", severity: "med", age: "9 d" },
    { title: "MPCA · BCCI subsidy receivable un-reconciled ₹42 L", severity: "med", age: "12 d" },
];

/* ---------- Division scorecard --------------------------------------- */
export const SCORECARD_DIMS = ["Tournaments Hosted", "Matches Played", "Budget Util.", "Claim TAT", "Officials Contrib.", "Squad Depth"];
export const SCORECARD_ROWS = [
    { div: "Indore",   scores: [92, 88, 84, 78, 91, 87] },
    { div: "Bhopal",   scores: [86, 82, 88, 74, 84, 81] },
    { div: "Gwalior",  scores: [78, 74, 91, 68, 79, 76] },
    { div: "Jabalpur", scores: [72, 78, 76, 82, 71, 74] },
    { div: "Ujjain",   scores: [68, 72, 82, 66, 68, 72] },
    { div: "Ratlam",   scores: [62, 68, 74, 78, 62, 66] },
    { div: "Sagar",    scores: [56, 62, 71, 62, 58, 62] },
    { div: "Rewa",     scores: [51, 58, 68, 71, 54, 58] },
    { div: "Satna",    scores: [46, 52, 62, 68, 48, 52] },
    { div: "Shahdol",  scores: [42, 48, 58, 64, 44, 47] },
];
