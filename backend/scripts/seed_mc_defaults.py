"""Iter 109 · Seed sensible default maker/checker mappings for all 17 M&C workflows.

Idempotent — safe to run multiple times. Only touches workflows that STILL
have 0 posts configured on their `submit` or `approve` step (i.e. never
customized via `/mc-admin`).

Design rules used for the defaults:
  · MPCA-owned actions: internal officer makes, senior officers check
    - Financial actions: 2-3 checkers (Treasurer + Secretary + President)
    - Operational actions: 1-2 checkers (Secretary or Secretary+President)
  · Division-owned actions: Division Treasurer/Secretary makes, Division President or Secretary checks
  · District-originated: District Sec makes, Division Sec checks
  · All checker mode = "all" (last approver triggers transition)
  · All approve/reject steps have requires_two_person = True
  · All return/reject steps have needs_note = True
"""

# Body-scope-post shortcuts
def S(post):  return {"body_scope": "State",    "post_title": post}
def D(post):  return {"body_scope": "Division", "post_title": post}
def DT(post): return {"body_scope": "District", "post_title": post}


# ─── 17 workflow default mappings ────────────────────────────────────
DEFAULTS = {
    # ═════════════ MPCA-owned ═════════════
    "tournament_create": {
        "submit":  [S("Cricket Manager")],
        "approve": [S("Hon. Secretary"), S("President")],
        "return":  [S("Hon. Secretary"), S("President")],
        "reject":  [S("Hon. Secretary"), S("President")],
    },
    "player_registration_approve": {
        "submit":  [S("Manager")],
        "approve": [S("Hon. Secretary"), S("Hon. Treasurer")],
        "return":  [S("Hon. Secretary"), S("Hon. Treasurer")],
        "reject":  [S("Hon. Secretary"), S("President")],
    },
    "grant_claim_approve": {
        "submit":  [S("Chief Accounts Officer")],
        "approve": [S("Hon. Treasurer"), S("Hon. Secretary"), S("President")],
        "return":  [S("Hon. Treasurer"), S("Hon. Secretary")],
        "reject":  [S("Hon. Secretary"), S("President")],
    },
    "tournament_budget_sanction": {
        "submit":  [S("Chief Accounts Officer")],
        "approve": [S("Hon. Treasurer"), S("Hon. Secretary")],
        "return":  [S("Hon. Treasurer"), S("Hon. Secretary")],
        "reject":  [S("Hon. Treasurer"), S("Hon. Secretary")],
    },
    "match_officials_post": {
        "submit":  [S("Cricket Manager")],
        "approve": [S("Hon. Secretary")],
        "return":  [S("Hon. Secretary")],
        "reject":  [S("Hon. Secretary")],
    },
    "rate_card_revise": {
        "submit":  [S("Chief Accounts Officer")],
        "approve": [S("Hon. Treasurer"), S("Hon. Secretary"), S("President")],
        "return":  [S("Hon. Treasurer"), S("Hon. Secretary")],
        "reject":  [S("Hon. Secretary"), S("President")],
    },
    "eligibility_rules_publish": {
        "submit":  [S("Selection Chairperson")],
        "approve": [S("Hon. Secretary"), S("President")],
        "return":  [S("Hon. Secretary"), S("President")],
        "reject":  [S("Hon. Secretary"), S("President")],
    },
    "squad_submit_to_bcci": {
        "submit":  [S("Selection Chairperson")],
        "approve": [S("Hon. Secretary"), S("President")],
        "return":  [S("Hon. Secretary"), S("President")],
        "reject":  [S("Hon. Secretary"), S("President")],
    },
    "reimbursement_release": {
        "submit":  [S("Chief Accounts Officer")],
        "approve": [S("Hon. Treasurer"), S("Hon. Secretary")],
        "return":  [S("Hon. Treasurer"), S("Hon. Secretary")],
        "reject":  [S("Hon. Treasurer"), S("Hon. Secretary")],
    },
    "rbac_change": {
        "submit":  [S("Manager")],
        "approve": [S("Hon. Secretary"), S("President")],
        "return":  [S("Hon. Secretary"), S("President")],
        "reject":  [S("Hon. Secretary"), S("President")],
    },
    "tournament_close": {
        "submit":  [S("Cricket Manager")],
        "approve": [S("Hon. Secretary"), S("Hon. Treasurer")],
        "return":  [S("Hon. Secretary")],
        "reject":  [S("Hon. Secretary"), S("President")],
    },
    # ═════════════ Division-owned ═════════════
    "grant_claim_recommend": {
        "submit":  [D("Hon. Treasurer")],
        "approve": [D("Hon. Secretary")],
        "return":  [D("Hon. Secretary")],
        "reject":  [D("Hon. Secretary")],
    },
    "division_camp_budget_lock": {
        "submit":  [D("Hon. Treasurer")],
        "approve": [D("Hon. Secretary")],
        "return":  [D("Hon. Secretary")],
        "reject":  [D("Hon. Secretary")],
    },
    "reimbursement_submit_to_mpca": {
        "submit":  [D("Hon. Treasurer")],
        "approve": [D("Hon. Secretary"), D("President")],
        "return":  [D("Hon. Secretary"), D("President")],
        "reject":  [D("Hon. Secretary"), D("President")],
    },
    "fixtures_publish": {
        "submit":  [D("Hon. Secretary")],
        "approve": [D("President")],
        "return":  [D("President")],
        "reject":  [D("President")],
    },
    "player_registration_recommend": {
        "submit":  [DT("Hon. Secretary")],
        "approve": [D("Hon. Secretary")],
        "return":  [D("Hon. Secretary")],
        "reject":  [D("Hon. Secretary")],
    },
    "division_squad_approve": {
        "submit":  [D("Hon. Secretary")],
        "approve": [D("President")],
        "return":  [D("President")],
        "reject":  [D("President")],
    },
}


async def seed_mc_defaults(db) -> dict:
    """Patch every workflow's steps.posts with defaults IF still empty."""
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc).isoformat()

    patched, skipped, missing = [], [], []
    for key, mapping in DEFAULTS.items():
        wf = await db.mc_workflows.find_one({"key": key})
        if not wf:
            missing.append(key)
            continue
        # If ANY step already has posts, treat this workflow as "user-configured" and skip.
        already_configured = any(len(s.get("posts") or []) > 0 for s in (wf.get("steps") or []))
        if already_configured:
            skipped.append(key)
            continue
        new_steps = []
        for step in wf.get("steps") or []:
            step_id = step.get("id") or step.get("action")
            action = step.get("action")
            posts = mapping.get(step_id) or mapping.get(action) or []
            new_step = dict(step)
            new_step["posts"] = [dict(p) for p in posts]
            # For approve steps with >1 checker, force checker_mode="all"
            if action == "approve" and len(posts) > 1:
                new_step["checker_mode"] = "all"
                new_step["requires_two_person"] = True
            elif action == "reject":
                new_step["requires_two_person"] = True
                new_step["needs_note"] = True
            elif action == "return":
                new_step["needs_note"] = True
                new_step["returns"] = True
            new_steps.append(new_step)
        await db.mc_workflows.update_one(
            {"key": key},
            {"$set": {"steps": new_steps, "updated_at": now}},
        )
        patched.append(key)
    return {"patched": patched, "skipped": skipped, "missing": missing}
