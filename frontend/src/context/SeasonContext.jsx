import { createContext, useContext, useEffect, useState, useCallback } from "react";

/**
 * Sprint M27 · Global Cricketing Season Context
 * ─────────────────────────────────────────────
 * A "cricketing season" runs from Aug of year N → Jul of year N+1.
 * The label follows the fiscal_cycle convention "YYYY-YY" (e.g. Aug 2026 → Jul 2027 = "2026-27").
 *
 * Every module in the ERP that carries a `fiscal_cycle` field is filtered by
 * this global value. The chosen season is persisted in localStorage under
 * `mpca_season` and is pushed into every axios GET request via a query param
 * (see `/lib/api.js`).
 *
 * User story: "I want all information in this ERP to be filtered by cricketing
 * season, like current is season 2026-27. All things in the ERP should be able
 * to get filtered by season — schemes, tournaments, calendar, etc. User should
 * be able to change the season from the dropdown on the top right of the ERP."
 */

// Cricketing season boundary — August 1 of "YYYY" starts "YYYY-YY+1".
export const currentCricketSeason = (now = new Date()) => {
    const y = now.getFullYear();
    // Aug (month index 7) or later → season YYYY-YY+1.
    // Before Aug → previous season (YYYY-1)-YY.
    const startYear = now.getMonth() >= 7 ? y : y - 1;
    const endYear = String(startYear + 1).slice(-2);
    return `${startYear}-${endYear}`;
};

export const buildSeasonList = (currentPin = "2026-27") => {
    // Rolling 6-season window centred on the pinned current + 2 past + 3 future
    const start = parseInt(currentPin.split("-")[0], 10);
    const list = [];
    for (let i = -3; i <= 3; i++) {
        const y = start + i;
        list.push(`${y}-${String(y + 1).slice(-2)}`);
    }
    return list;
};

const DEFAULT_SEASON = "2026-27"; // Per user directive · Aug 2026 → Jul 2027.

const SeasonContext = createContext({
    season: DEFAULT_SEASON,
    setSeason: () => { },
    seasons: buildSeasonList(DEFAULT_SEASON),
});

export const SeasonProvider = ({ children }) => {
    const [season, setSeasonState] = useState(() => {
        try {
            const s = typeof window !== "undefined" && window.localStorage.getItem("mpca_season");
            return s || DEFAULT_SEASON;
        } catch { return DEFAULT_SEASON; }
    });

    // Keep the global `window.__mpca_season` mirror in sync so the axios
    // interceptor (which lives outside React) can read it without a re-render.
    useEffect(() => {
        try {
            window.__mpca_season = season;
            window.localStorage.setItem("mpca_season", season);
        } catch { /* noop */ }
    }, [season]);

    const setSeason = useCallback((next) => setSeasonState(next), []);

    return (
        <SeasonContext.Provider value={{ season, setSeason, seasons: buildSeasonList(season) }}>
            {children}
        </SeasonContext.Provider>
    );
};

export const useSeason = () => useContext(SeasonContext);
