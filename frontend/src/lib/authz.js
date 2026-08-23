/**
 * lib/authz.js — Iter 108
 *
 * Frontend RBAC mirror of /app/backend/lib/authz.py.  ⚠️ This is UX only —
 * every real access decision is enforced by the backend.  If the two get out
 * of sync, the backend wins; the UI just avoids showing options that will
 * 403 anyway.
 *
 * Public API
 * ──────────
 *   ROLES · PERMISSIONS · ROLE_MATRIX (mirror server)
 *   roleOf(user) : Role
 *   can(user|role, permission) : boolean
 *   <Guard action="players.read.all">…</Guard>  · null-if-not-allowed helper
 */
import React from "react";

export const ROLES = Object.freeze({
    MPCA_PRESIDENT:     "mpca_president",
    MPCA_SECRETARY:     "mpca_secretary",
    MPCA_TREASURER:     "mpca_treasurer",
    DIVISION_SECRETARY: "division_secretary",
    DISTRICT_SECRETARY: "district_secretary",
    MATCH_OFFICIAL:     "match_official",
    ANON:               "anon",
});

export const PERMISSIONS = Object.freeze({
    DASHBOARD_SEASON_VIEW:   "dashboard.season.view",
    DASHBOARD_PLAYERS_VIEW:  "dashboard.players.view",
    DASHBOARD_GRANTS_VIEW:   "dashboard.grants.view",
    DASHBOARD_BUDGET_VIEW:   "dashboard.budget.view",
    DASHBOARD_STATEWIDE:     "dashboard.statewide",

    PLAYERS_READ_ALL:        "players.read.all",
    PLAYERS_READ_SCOPED:     "players.read.scoped",
    TOURNAMENTS_READ_ALL:    "tournaments.read.all",
    TOURNAMENTS_READ_SCOPED: "tournaments.read.scoped",
    GRANTS_READ_ALL:         "grants.read.all",
    GRANTS_READ_SCOPED:      "grants.read.scoped",
    BUDGETS_READ_ALL:        "budgets.read.all",
    BUDGETS_READ_SCOPED:     "budgets.read.scoped",

    PLAYERS_APPROVE:         "players.approve",
    PLAYERS_DISQUALIFY:      "players.disqualify",
    GRANTS_APPROVE:          "grants.approve",
    GRANTS_RECOMMEND:        "grants.recommend",
    GRANTS_SUBMIT:           "grants.submit",
    BUDGETS_APPROVE:         "budgets.approve",

    RBAC_MANAGE:             "rbac.manage",
    USERS_MANAGE:            "users.manage",
});

const P = PERMISSIONS;

export const ROLE_MATRIX = Object.freeze({
    [ROLES.MPCA_PRESIDENT]: new Set([
        P.DASHBOARD_SEASON_VIEW, P.DASHBOARD_PLAYERS_VIEW, P.DASHBOARD_GRANTS_VIEW, P.DASHBOARD_BUDGET_VIEW,
        P.DASHBOARD_STATEWIDE,
        P.PLAYERS_READ_ALL, P.TOURNAMENTS_READ_ALL, P.GRANTS_READ_ALL, P.BUDGETS_READ_ALL,
        P.PLAYERS_APPROVE, P.GRANTS_APPROVE, P.BUDGETS_APPROVE,
    ]),
    [ROLES.MPCA_SECRETARY]: new Set([
        P.DASHBOARD_SEASON_VIEW, P.DASHBOARD_PLAYERS_VIEW, P.DASHBOARD_GRANTS_VIEW, P.DASHBOARD_BUDGET_VIEW,
        P.DASHBOARD_STATEWIDE,
        P.PLAYERS_READ_ALL, P.TOURNAMENTS_READ_ALL, P.GRANTS_READ_ALL, P.BUDGETS_READ_ALL,
        P.PLAYERS_APPROVE, P.PLAYERS_DISQUALIFY, P.GRANTS_APPROVE, P.BUDGETS_APPROVE,
        P.RBAC_MANAGE, P.USERS_MANAGE,
    ]),
    [ROLES.MPCA_TREASURER]: new Set([
        P.DASHBOARD_SEASON_VIEW, P.DASHBOARD_PLAYERS_VIEW, P.DASHBOARD_GRANTS_VIEW, P.DASHBOARD_BUDGET_VIEW,
        P.DASHBOARD_STATEWIDE,
        P.PLAYERS_READ_ALL, P.TOURNAMENTS_READ_ALL, P.GRANTS_READ_ALL, P.BUDGETS_READ_ALL,
        P.GRANTS_APPROVE, P.BUDGETS_APPROVE,
    ]),
    [ROLES.DIVISION_SECRETARY]: new Set([
        P.DASHBOARD_SEASON_VIEW, P.DASHBOARD_PLAYERS_VIEW, P.DASHBOARD_GRANTS_VIEW, P.DASHBOARD_BUDGET_VIEW,
        P.PLAYERS_READ_SCOPED, P.TOURNAMENTS_READ_SCOPED, P.GRANTS_READ_SCOPED, P.BUDGETS_READ_SCOPED,
        P.GRANTS_RECOMMEND, P.PLAYERS_APPROVE,
    ]),
    [ROLES.DISTRICT_SECRETARY]: new Set([
        P.DASHBOARD_SEASON_VIEW, P.DASHBOARD_PLAYERS_VIEW, P.DASHBOARD_GRANTS_VIEW,
        P.PLAYERS_READ_SCOPED, P.TOURNAMENTS_READ_SCOPED, P.GRANTS_READ_SCOPED,
        P.GRANTS_SUBMIT,
    ]),
    [ROLES.MATCH_OFFICIAL]: new Set([P.GRANTS_SUBMIT]),
    [ROLES.ANON]: new Set(),
});

/* ---------- roleOf(user) ---------- */
export function roleOf(user) {
    if (!user) return ROLES.ANON;
    // Iter 127 · Prefer the RBAC role_id assigned via the users collection —
    // that's the authoritative source. body_type-based inference is only a
    // fallback for legacy accounts that haven't been migrated to role_id.
    const explicit = (user.role_id || user.role || "").trim();
    if (explicit && Object.values(ROLES).includes(explicit)) return explicit;

    const bt = (user.body_type || "").toLowerCase();
    const post = (user.post || "").toLowerCase();
    if (bt === "state") {
        if (post.includes("president"))   return ROLES.MPCA_PRESIDENT;
        if (post.includes("treasurer"))   return ROLES.MPCA_TREASURER;
        return ROLES.MPCA_SECRETARY;
    }
    if (bt === "division") return ROLES.DIVISION_SECRETARY;
    if (bt === "district") return ROLES.DISTRICT_SECRETARY;
    if (bt === "official" || bt === "match_official") return ROLES.MATCH_OFFICIAL;
    return ROLES.ANON;
}

/* ---------- can(userOrRole, permission) ---------- */
export function can(userOrRole, permission) {
    if (!userOrRole || !permission) return false;
    const role = typeof userOrRole === "string" ? userOrRole : roleOf(userOrRole);
    const bag = ROLE_MATRIX[role];
    return !!(bag && bag.has(permission));
}

/* ---------- <Guard action="..."> ---------- */
export function Guard({ user, action, anyOf, fallback = null, children }) {
    if (!user) return fallback;
    const ok = anyOf
        ? anyOf.some((p) => can(user, p))
        : can(user, action);
    return ok ? <>{children}</> : fallback;
}
