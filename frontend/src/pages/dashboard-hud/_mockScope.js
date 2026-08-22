/**
 * dashboard-hud/_mockScope.js
 * ---------------------------
 * Iter 108b · Scopes the /design-preview sample data to the caller's persona.
 *
 * The Warm* tabs currently render sample data.  Prior to this helper, EVERY
 * persona saw the same MPCA-wide numbers — which meant Division Secretaries
 * appeared to see "all divisions' info" even though the real endpoints (once
 * wired) will filter server-side.  This helper slices the mock arrays so the
 * demo tabs behave as the real ones will.
 *
 *   State personas       →  full mocks unchanged
 *   Division persona     →  own DIV + child DIST rows;  KPIs scaled ~1/10th
 *   District persona     →  own DIST rows only;         KPIs scaled ~1/50th
 *   Match Official       →  n/a (redirected to own console)
 */
import * as MOCK from "@/pages/design-preview/_mock";

// Rough "division-share" scaler — sample data is MPCA-wide so we take 1/N
// for a single division (10 divisions ⇒ ~1/10).  Districts get 1/5 of that.
const DIV_SHARE = 0.1;
const DIST_SHARE_OF_DIV = 0.2;

const divisionMeta = {
    "DIV-IND": { name: "Indore",   city: "Indore",   suffix: "IND" },
    "DIV-BPL": { name: "Bhopal",   city: "Bhopal",   suffix: "BPL" },
    "DIV-GWL": { name: "Gwalior",  city: "Gwalior",  suffix: "GWL" },
    "DIV-JBP": { name: "Jabalpur", city: "Jabalpur", suffix: "JBP" },
    "DIV-UJN": { name: "Ujjain",   city: "Ujjain",   suffix: "UJN" },
    "DIV-RTL": { name: "Ratlam",   city: "Ratlam",   suffix: "RTL" },
    "DIV-SGR": { name: "Sagar",    city: "Sagar",    suffix: "SGR" },
    "DIV-RWA": { name: "Rewa",     city: "Rewa",     suffix: "RWA" },
    "DIV-STN": { name: "Satna",    city: "Satna",    suffix: "STN" },
    "DIV-SHM": { name: "Shahdol",  city: "Shahdol",  suffix: "SHM" },
};

const s = (n, mul) => Math.max(0, Math.round(n * mul));
const sFloat = (n, mul) => Math.max(0, +(n * mul).toFixed(1));

export function scopeLabel(persona) {
    if (!persona) return "MPCA · state-wide";
    const bt = (persona.body_type || "").toLowerCase();
    if (bt === "state") return "MPCA · state-wide";
    if (bt === "division") return `${persona.body_name || persona.body_code} · own + child districts`;
    if (bt === "district") return `${persona.body_name || persona.body_code} · own only`;
    return persona.body_code || "—";
}

export function useScopedMocks(persona) {
    const bt = (persona?.body_type || "").toLowerCase();
    const bodyCode = persona?.body_code || "";
    const isState = bt === "state";
    const isDiv = bt === "division";
    const isDist = bt === "district";

    // State — pass-through
    if (isState) {
        return {
            KPIS: MOCK.KPIS,
            LIVE_MATCHES: MOCK.LIVE_MATCHES,
            TICKER: MOCK.TICKER,
            UPCOMING_TOSSES: MOCK.UPCOMING_TOSSES,
            GRANT_STAGES: MOCK.GRANT_STAGES,
            GRANT_CARDS: MOCK.GRANT_CARDS,
            AGEING_BUCKETS: MOCK.AGEING_BUCKETS,
            BUDGET_TREE: MOCK.BUDGET_TREE,
            BUDGET_UTILISATION: MOCK.BUDGET_UTILISATION,
            TOP_OVERRUNS: MOCK.TOP_OVERRUNS,
            INVOICE_VELOCITY: MOCK.INVOICE_VELOCITY,
            share: 1,
        };
    }

    const meta = divisionMeta[bodyCode] || { name: bodyCode, city: bodyCode, suffix: "" };
    const share = isDist ? DIV_SHARE * DIST_SHARE_OF_DIV : DIV_SHARE;

    // Season Overview -----------------------------------------------------
    const KPIS = {
        tournaments_active: s(MOCK.KPIS.tournaments_active, share),
        matches_today:      s(MOCK.KPIS.matches_today, share),
        disbursed_ytd_cr:   sFloat(MOCK.KPIS.disbursed_ytd_cr, share),
        active_claims:      s(MOCK.KPIS.active_claims, share),
        officials_on_duty:  s(MOCK.KPIS.officials_on_duty, share),
        squads_finalised:   s(MOCK.KPIS.squads_finalised, share),
    };
    // Keep live matches only from the persona's city
    const cityMatch = (row) => (row.location || "").toLowerCase().includes(meta.city.toLowerCase());
    const scopedMatches = MOCK.LIVE_MATCHES.filter(cityMatch);
    // Ticker — keep only lines that mention the division code / city
    const tokenMatch = (line) => {
        const l = line.toLowerCase();
        return l.includes(bodyCode.toLowerCase()) || l.includes(meta.city.toLowerCase());
    };
    const scopedTicker = MOCK.TICKER.filter(tokenMatch);
    const scopedTosses = MOCK.UPCOMING_TOSSES.filter((t) => (t.venue || "").toLowerCase().includes(meta.city.toLowerCase()));

    // Grants ------------------------------------------------------------
    const scopedCards = MOCK.GRANT_CARDS.filter((c) => (c.body || "").endsWith(meta.suffix) || (c.body || "") === bodyCode);
    // Recount stages from the scoped cards so column heights match card counts
    const scopedStages = MOCK.GRANT_STAGES.map((st) => {
        const cardsInStage = scopedCards.filter((c) => c.stage === st.key);
        return {
            ...st,
            count: cardsInStage.length,
            sum_cr: +cardsInStage.reduce((a, c) => a + (c.amount_l || 0) / 100, 0).toFixed(2),
        };
    });
    const scopedAgeing = MOCK.AGEING_BUCKETS.map((b) => ({ ...b, count: s(b.count, share) }));

    // Budget ------------------------------------------------------------
    const scaleTree = (node) => ({
        ...node,
        value: sFloat(node.value, share),
        ...(node.children ? { children: node.children.map(scaleTree) } : {}),
    });
    const BUDGET_TREE = scaleTree(MOCK.BUDGET_TREE);
    const TOP_OVERRUNS = MOCK.TOP_OVERRUNS;   // overrun % is scale-invariant
    const INVOICE_VELOCITY = MOCK.INVOICE_VELOCITY.map((v) => s(v, share));

    return {
        KPIS,
        LIVE_MATCHES: scopedMatches,
        TICKER: scopedTicker.length ? scopedTicker : [`${meta.name} · no live signals right now`],
        UPCOMING_TOSSES: scopedTosses,
        GRANT_STAGES: scopedStages,
        GRANT_CARDS: scopedCards,
        AGEING_BUCKETS: scopedAgeing,
        BUDGET_TREE,
        BUDGET_UTILISATION: MOCK.BUDGET_UTILISATION,
        TOP_OVERRUNS,
        INVOICE_VELOCITY,
        share,
    };
}

/* ---------- Player-tab scaler (own file has its own mock arrays) ------ */
export function scopePlayerMocks(persona, {
    KPIS, FUNNEL, KYC_AGEING, DOC_COMPLETENESS, AI_SPLIT, GUEST_QUOTAS, CATEGORY_MIX,
    AGE_PYRAMID, POSITIONAL, CROSS_LOAD, DIV_DISTRIBUTION, TRANSFERS,
}) {
    const bt = (persona?.body_type || "").toLowerCase();
    if (bt === "state") {
        return { KPIS, FUNNEL, KYC_AGEING, DOC_COMPLETENESS, AI_SPLIT, GUEST_QUOTAS, CATEGORY_MIX,
                 AGE_PYRAMID, POSITIONAL, CROSS_LOAD, DIV_DISTRIBUTION, TRANSFERS };
    }
    const isDist = bt === "district";
    const share = isDist ? DIV_SHARE * DIST_SHARE_OF_DIV : DIV_SHARE;
    const scaledKpis = {
        active:      s(KPIS.active, share),
        pending:     s(KPIS.pending, share),
        suspended:   s(KPIS.suspended, share),
        debutants_ytd: s(KPIS.debutants_ytd, share),
        court_order: s(KPIS.court_order, share),
    };
    const scaledFunnel = FUNNEL.map((r) => ({ ...r, value: s(r.value, share) }));
    const scaledKyc    = KYC_AGEING.map((k) => ({ ...k, count: s(k.count, share) }));
    const scaledDoc    = {
        complete:   s(DOC_COMPLETENESS.complete, share),
        incomplete: s(DOC_COMPLETENESS.incomplete, share),
        total:      s(DOC_COMPLETENESS.total, share),
    };
    const scaledAi     = AI_SPLIT.map((r) => ({ ...r, value: s(r.value, share) }));
    const scaledQuotas = GUEST_QUOTAS.map((q) => ({ ...q, used: s(q.used, share), cap: s(q.cap, share) || q.cap }));
    const scaledCatMix = CATEGORY_MIX.map((r) => ({ ...r, value: s(r.value, share) }));
    const scaledPyramid = AGE_PYRAMID.map((r) => ({ ...r, men: s(r.men, share), women: s(r.women, share) }));
    const scaledPos    = POSITIONAL.map((r) => ({ ...r, value: s(r.value, share) }));

    // Cross-load : cap squad counts at ~scale × original but keep min 1
    const scaledLoad   = CROSS_LOAD.slice(0, Math.max(5, Math.round(CROSS_LOAD.length * share * 10)))
        .map((r) => ({ ...r, squads: Math.max(1, Math.round(r.squads * (share * 5))) }));

    // Division distribution — only the caller's DIV (or its DIV parent if District)
    let scopedDivDist = DIV_DISTRIBUTION;
    if (persona?.body_code) {
        const divCode = persona.body_code.startsWith("DIST-")
            ? "DIV-" + persona.body_code.split("-").pop()
            : persona.body_code;
        scopedDivDist = DIV_DISTRIBUTION.filter((d) => d.code === divCode);
        if (!scopedDivDist.length && persona.body_code) {
            scopedDivDist = [{ code: persona.body_code, players: scaledKpis.active }];
        }
    }
    const scopedTransfers = TRANSFERS.filter((t) =>
        persona?.body_code
            ? (t.division === persona.body_code || t.division === "DIV-" + (persona.body_code.split("-").pop() || ""))
            : true
    );

    return {
        KPIS: scaledKpis, FUNNEL: scaledFunnel, KYC_AGEING: scaledKyc,
        DOC_COMPLETENESS: scaledDoc, AI_SPLIT: scaledAi, GUEST_QUOTAS: scaledQuotas,
        CATEGORY_MIX: scaledCatMix, AGE_PYRAMID: scaledPyramid, POSITIONAL: scaledPos,
        CROSS_LOAD: scaledLoad, DIV_DISTRIBUTION: scopedDivDist, TRANSFERS: scopedTransfers,
    };
}
