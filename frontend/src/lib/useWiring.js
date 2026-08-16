import { useEffect, useState, useMemo } from "react";
import { api } from "@/lib/api";

/**
 * MPCA-243 · Ship 2 · Shared wiring hooks
 * ────────────────────────────────────────
 * Single source of truth for consuming `/tournaments/{tid}/wiring-status`
 * on the frontend. In-module cache keyed by tournament id so multiple
 * panels on the same page share ONE HTTP call.
 *
 * Usage:
 *     const step = useWiringStep(tournament.id, "unified_budget");
 *     if (step.owner === "Division") { ... }
 *
 *     const canEdit = useWiringOwnerMatch(tournament.id, "unified_budget", persona);
 */

const _cache = new Map(); // tid → Promise<wiring-status payload>

const _fetchWiringStatus = (tid) => {
    if (!tid) return Promise.resolve(null);
    if (!_cache.has(tid)) {
        _cache.set(
            tid,
            api.get(`/tournaments/${tid}/wiring-status`).then(r => r.data).catch(() => null),
        );
    }
    return _cache.get(tid);
};

/** Force a refresh of the cached wiring status (e.g. after edits in the Wiring Console). */
export const invalidateWiringCache = (tid) => { if (tid) _cache.delete(tid); };

/** Return the wiring cell for `stepKey` on `tid`. Null while loading / on error. */
export const useWiringStep = (tid, stepKey) => {
    const [step, setStep] = useState(null);
    useEffect(() => {
        let alive = true;
        _fetchWiringStatus(tid).then(data => {
            if (!alive) return;
            const s = (data?.steps || []).find(x => x.key === stepKey);
            setStep(s || null);
        });
        return () => { alive = false; };
    }, [tid, stepKey]);
    return step;
};

const _OWNER_ALLOWED = {
    MPCA:     new Set(["State"]),
    Division: new Set(["State", "Division"]),
    District: new Set(["State", "Division", "District"]),
};

/**
 * Return true if the persona's body_type is inside the wiring owner's
 * allowed set. State personas can always act; Division on Division/District
 * owned steps; District on District-owned steps.
 * Returns `null` while wiring is still loading (so callers can render a
 * neutral state instead of flashing "denied").
 */
export const useWiringOwnerMatch = (tid, stepKey, persona) => {
    const step = useWiringStep(tid, stepKey);
    return useMemo(() => {
        if (!step) return null;
        const allowed = _OWNER_ALLOWED[step.owner] || new Set(["State"]);
        return allowed.has(persona?.body_type);
    }, [step, persona?.body_type]);
};
