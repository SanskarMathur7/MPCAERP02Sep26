/**
 * MPCA-151 / MPCA-152 · Feb 2026 — Player Registration Document Spec
 * ─────────────────────────────────────────────────────────────────
 * SINGLE source of truth for the documents a player must upload on the
 * public registration form AND that show up on the Player Profile · KYC
 * page. Consumed by:
 *
 *   • /app/frontend/src/pages/PublicPlayerRegistration.jsx
 *   • /app/frontend/src/pages/PlayerRegistrations.jsx  (review drawer)
 *   • Player Profile KYC panel (per MPCA-152 — keep in sync)
 *
 * Adding a new document: append here + add the same `field` name to the
 * PlayerRegistrationData Pydantic model in
 * /app/backend/routes/player_registrations.py.
 */

export const REGISTRATION_DOC_SPEC = [
    // ── Identity + core ──
    { field: "photo_url", label: "Passport-size photograph", required: true, group: "identity", accept: "image/*" },
    { field: "aadhaar_url", label: "Aadhaar Card", required: true, group: "identity" },
    { field: "aadhaar_history_url", label: "Aadhaar Update History (UIDAI)", required: false, group: "identity", hint: "Download from UIDAI portal" },
    { field: "pan_url", label: "PAN Card", required: false, group: "identity", hint: "Mandatory for 18+" },
    { field: "birth_cert_url", label: "Birth Certificate", required: true, group: "identity" },
    { field: "address_proof_url", label: "Current Address Proof", required: true, group: "identity" },

    // ── MPCA-151 · New Samagra + affidavits + bonafide ──
    { field: "samagra_id_player_url", label: "Samagra ID · Player", required: true, group: "samagra" },
    { field: "samagra_id_family_url", label: "Samagra ID · Family", required: true, group: "samagra" },
    {
        field: "consent_form_url",
        label: "Consent Form (Notarized)",
        required: true,
        group: "affidavits",
        hint: "Download the MPCA template · get it notarized · then upload",
        template_url: "/api/uploads/consent_form_template.pdf",   // MPCA will publish
    },
    {
        field: "no_study_affidavit_url",
        label: "No-Study Affidavit",
        required: false,
        group: "affidavits",
        hint: "Only if the player is NOT currently studying (U-23 path).",
        template_url: "/api/uploads/no_study_affidavit_template.pdf",   // MPCA will publish
        depends_on: { field: "no_recent_studies", equals: true },
    },
    { field: "bonafide_school_cert_url", label: "School Bonafide Certificate", required: true, group: "affidavits", depends_on: { field: "is_employed", equals: false } },

    // ── MPCA-151 · Education (marksheet) OR Employment (letter + salary + bank) ──
    { field: "marksheet_3yr_url", label: "Marksheet · last 3 years (single PDF)", required: true, group: "education", depends_on: { field: "is_employed", equals: false } },
    { field: "appointment_letter_url", label: "Appointment Letter", required: true, group: "employment", depends_on: { field: "is_employed", equals: true } },
    { field: "salary_slip_url", label: "Latest Salary Slip", required: true, group: "employment", depends_on: { field: "is_employed", equals: true } },
    { field: "bank_statement_1yr_url", label: "1-Year Bank Statement (PDF)", required: true, group: "employment", depends_on: { field: "is_employed", equals: true } },

    // ── MPCA-151 · Cross-division audit ──
    {
        field: "noc_previous_division_url",
        label: "NOC from Previous Division",
        required: true,
        group: "cross_division",
        hint: "Required if you played from a different Division last season.",
        depends_on: { field: "last_season_division_code_differs", equals: true },   // computed client-side
    },

    // ── Legacy · retain ──
    { field: "affidavit_url", label: "Legacy Affidavit (M39o)", required: false, group: "legacy" },
    { field: "cancelled_cheque_url", label: "Cancelled cheque", required: false, group: "banking" },
    { field: "gst_certificate_url", label: "GST Certificate", required: false, group: "banking", hint: "Only if GST number provided" },
    { field: "passport_url", label: "Passport", required: false, group: "identity_alt" },
    { field: "driving_licence_url", label: "Driving Licence", required: false, group: "identity_alt" },
    { field: "voter_id_url", label: "Voter ID", required: false, group: "identity_alt" },
];

// Handy helpers ----------------------------------------------------------
export const REG_DOC_GROUPS = [
    { code: "identity", label: "Identity & Address" },
    { code: "samagra", label: "Samagra IDs" },
    { code: "affidavits", label: "Affidavits & Consent" },
    { code: "education", label: "Education (Marksheets)" },
    { code: "employment", label: "Employment (Alternative to marksheets)" },
    { code: "cross_division", label: "Cross-Division Registration" },
    { code: "banking", label: "Banking" },
    { code: "identity_alt", label: "Other ID (Optional)" },
    { code: "legacy", label: "Legacy" },
];

/**
 * Returns the document specs that apply to the given form state.
 * (Evaluates every `depends_on` condition.)
 *   e.g. isDocApplicable(spec, form) → true/false
 */
export const isDocApplicable = (spec, form) => {
    if (!spec.depends_on) return true;
    const { field, equals } = spec.depends_on;
    if (field === "last_season_division_code_differs") {
        const last = (form?.last_season_division_code || "").trim();
        const current = (form?.preferred_division_code || "").trim();
        return equals ? (Boolean(last) && last !== current) : true;
    }
    return form?.[field] === equals;
};

export const missingRequiredDocs = (form) =>
    REGISTRATION_DOC_SPEC.filter((s) => s.required && isDocApplicable(s, form) && !form?.[s.field]);
