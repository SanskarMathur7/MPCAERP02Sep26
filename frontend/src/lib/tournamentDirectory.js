/**
 * Sprint M23 · MPCA Tournament Directory
 * ───────────────────────────────────────
 * Named tournaments recognised by MPCA, extracted from the official
 * "MPCA Tournament Directory" PDF (2025-26). Grouped by the same
 * `tournament_type_code` used in `tournamentCatalog.js`.
 *
 * On the Add-Tournament flow (Step 2), after the user has picked a type
 * in Step 1, they get a dropdown of the recognised names below plus an
 * "Other / add manually" option that reveals a free-text field.
 */

export const TOURNAMENT_DIRECTORY = {
    inter_div: [
        { name: "MY Memorial Trophy",           age: "Senior" },
        { name: "Madhavrao Scindia Trophy",     age: "Senior" },
        { name: "JN Bhaya Trophy",              age: "Senior" },
        { name: "H Gaekwad Trophy",             age: "Senior" },
        { name: "SM Khan Trophy",               age: "Senior" },
        { name: "Parmanandbhai Patel Trophy",   age: "Senior" },
        { name: "Boys U-22 Limited Over Trophy", age: "U-22" },
        { name: "MM Jagdale Trophy",            age: "Senior" },
        { name: "AW Kanmadikar Trophy",         age: "Senior" },
        { name: "JS Anand Trophy",              age: "Women's" },
        { name: "Girls U-18 Trophy",            age: "U-18 (Girls)" },
    ],
    inter_district: [
        { name: "Indore Division Inter-District Championship", age: "Senior" },
        { name: "Bhopal Division Inter-District Championship", age: "Senior" },
        { name: "Gwalior Division Inter-District Championship", age: "Senior" },
        { name: "Jabalpur Division Inter-District Championship", age: "Senior" },
        { name: "Ujjain Division Inter-District Championship",   age: "Senior" },
    ],
    inter_school: [
        { name: "Inter-School Knockout · Boys U-14",  age: "U-14 (Boys)" },
        { name: "Inter-School Knockout · Boys U-16",  age: "U-16 (Boys)" },
        { name: "Inter-School Knockout · Boys U-19",  age: "U-19 (Boys)" },
        { name: "Inter-School Knockout · Girls U-16", age: "U-16 (Girls)" },
        { name: "Inter-School Knockout · Girls U-19", age: "U-19 (Girls)" },
    ],
    inter_club: [
        { name: "Inter-Club 'A' Grade Knockout · U-15",    age: "U-15" },
        { name: "Inter-Club 'A' Grade Knockout · U-18",    age: "U-18" },
        { name: "Inter-Club 'A' Grade Knockout · Senior",  age: "Senior" },
    ],
    coaching_camp: [
        { name: "Periodical Coaching Camp · U-14",   age: "U-14" },
        { name: "Periodical Coaching Camp · U-16",   age: "U-16" },
        { name: "Periodical Coaching Camp · U-19",   age: "U-19" },
        { name: "Periodical Coaching Camp · Senior", age: "Senior" },
    ],
    vacation_camp: [
        { name: "Summer Vacation Camp · U-14", age: "U-14" },
        { name: "Summer Vacation Camp · U-16", age: "U-16" },
        { name: "Winter Vacation Camp · U-14", age: "U-14" },
        { name: "Winter Vacation Camp · U-16", age: "U-16" },
    ],
    pre_camp: [
        { name: "Pre-Tournament Camp · MY Memorial", age: "Senior" },
        { name: "Pre-Tournament Camp · Madhavrao Scindia", age: "Senior" },
        { name: "Pre-Tournament Camp · JN Bhaya", age: "Senior" },
        { name: "Pre-Tournament Camp · Boys U-22 Limited Over", age: "U-22" },
        { name: "Pre-Tournament Camp · JS Anand (Women's)", age: "Women's" },
        { name: "Pre-Tournament Camp · Girls U-18", age: "U-18 (Girls)" },
    ],
    reciprocal: [
        { name: "Reciprocal Matches · Senior", age: "Senior" },
        { name: "Reciprocal Matches · U-22",   age: "U-22" },
        { name: "Reciprocal Matches · U-19",   age: "U-19" },
        { name: "Reciprocal Matches · Women's", age: "Women's" },
    ],
    inter_div_travel: [
        { name: "Travel Subsidy · MY Memorial",         age: "Senior" },
        { name: "Travel Subsidy · Madhavrao Scindia",   age: "Senior" },
        { name: "Travel Subsidy · JN Bhaya",            age: "Senior" },
        { name: "Travel Subsidy · H Gaekwad",           age: "Senior" },
        { name: "Travel Subsidy · JS Anand (Women's)",  age: "Women's" },
        { name: "Travel Subsidy · Boys U-22",           age: "U-22" },
        { name: "Travel Subsidy · Girls U-18",          age: "U-18 (Girls)" },
    ],
    bcci_staging: [
        // Men's — Elite / Plate multi-day
        { name: "Ranji Trophy · Elite",              age: "Senior · Elite" },
        { name: "Ranji Trophy · Plate",              age: "Senior · Plate" },
        { name: "Duleep Trophy",                     age: "Senior" },
        { name: "ZR Irani Cup",                      age: "Senior" },
        { name: "Col CK Nayudu Trophy · Elite",      age: "U-23 · Elite" },
        { name: "Col CK Nayudu Trophy · Plate",      age: "U-23 · Plate" },
        { name: "Cooch Behar Trophy · Elite",        age: "U-19 · Elite" },
        { name: "Cooch Behar Trophy · Plate",        age: "U-19 · Plate" },
        { name: "Vijay Merchant Trophy · Elite",     age: "U-16 · Elite" },
        { name: "Vijay Merchant Trophy · Plate",     age: "U-16 · Plate" },
        // Men's Limited overs
        { name: "Vijay Hazare Trophy",               age: "Senior" },
        { name: "Syed Mushtaq Ali Trophy",           age: "Senior · T20" },
        { name: "Men's U-23 State A One Day Trophy", age: "U-23" },
        { name: "Men's U-19 One Day Challenger Trophy", age: "U-19" },
        { name: "Vinoo Mankad Trophy",               age: "U-19" },
        { name: "Vizzy Trophy",                      age: "U-25" },
        // Women's
        { name: "Sr. Women's Multi-Day Inter-Zonal Trophy", age: "Women's" },
        { name: "Sr. Women's One Day Trophy",               age: "Women's" },
        { name: "Sr. Women's One Day Inter-Zonal Trophy",   age: "Women's" },
        { name: "Sr. Women's T20 Trophy",                   age: "Women's · T20" },
        { name: "Sr. Women's T20 Inter-Zonal Trophy",       age: "Women's · T20" },
        { name: "Women's U-23 One Day Trophy",              age: "U-23 (Women)" },
        { name: "Women's U-23 T20 Trophy",                  age: "U-23 (Women) · T20" },
        { name: "Women's U-19 One Day Trophy",              age: "U-19 (Women)" },
        { name: "Women's U-19 T20 Trophy",                  age: "U-19 (Women) · T20" },
        { name: "Women's U-15 One Day Trophy",              age: "U-15 (Women)" },
    ],
    away_participation: [
        // Away participation mirrors the BCCI list — the MP team travels to
        // another association for the SAME set of tournaments, so let the
        // user pick from the same list.
        { name: "Ranji Trophy · Elite",              age: "Senior · Elite" },
        { name: "Ranji Trophy · Plate",              age: "Senior · Plate" },
        { name: "Vijay Hazare Trophy",               age: "Senior" },
        { name: "Syed Mushtaq Ali Trophy",           age: "Senior · T20" },
        { name: "Col CK Nayudu Trophy",              age: "U-23" },
        { name: "Cooch Behar Trophy",                age: "U-19" },
        { name: "Vijay Merchant Trophy",             age: "U-16" },
        { name: "Vinoo Mankad Trophy",               age: "U-19" },
        { name: "Vizzy Trophy",                      age: "U-25" },
        { name: "Sr. Women's Multi-Day Trophy",      age: "Women's" },
        { name: "Sr. Women's One Day Trophy",        age: "Women's" },
        { name: "Sr. Women's T20 Trophy",            age: "Women's · T20" },
    ],
};

export const getDirectoryFor = (typeCode) => TOURNAMENT_DIRECTORY[typeCode] || [];
