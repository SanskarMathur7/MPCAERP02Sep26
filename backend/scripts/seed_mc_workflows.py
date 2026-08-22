"""Iter 109 · Seed the 17 canonical Maker-Checker workflow templates.

Each workflow lands in Mongo with NO makers/checkers pre-assigned. MPCA
opens `/mc-admin` and picks which posts play maker/checker for each step —
zero code change required to reconfigure.

Idempotent: existing workflows are preserved unless the seed record
introduces new steps.
"""
from datetime import datetime, timezone


CANONICAL_WORKFLOWS = [
    # ─────────────────── MPCA-owned ───────────────────
    {
        "key": "tournament_create",
        "label": "Create Tournament (MPCA)",
        "category": "MPCA",
        "description": "MPCA staff mints a BCCI / Inter-Divisional tournament. Goes live to all divisions after checker(s) approve.",
        "collection": "tournaments",
        "terminal_statuses": ["Approved", "Rejected"],
    },
    {
        "key": "player_registration_approve",
        "label": "Approve Player Registration (state-level)",
        "category": "MPCA",
        "description": "Final MPCA activation of a player-registration submission.",
        "collection": "player_registrations",
        "terminal_statuses": ["Approved", "Rejected"],
    },
    {
        "key": "grant_claim_approve",
        "label": "Approve Grant Claim (final MPCA sign-off)",
        "category": "MPCA",
        "description": "Final approval of a grant claim before payment release.",
        "collection": "grant_claims",
        "terminal_statuses": ["Approved", "Rejected"],
    },
    {
        "key": "tournament_budget_sanction",
        "label": "Sanction Unified Tournament Budget",
        "category": "MPCA",
        "description": "MPCA sanctions the per-body unified budget after Division acceptance.",
        "collection": "tournament_budgets",
        "terminal_statuses": ["Sanctioned", "Rejected"],
    },
    {
        "key": "match_officials_post",
        "label": "Post Match Officials to a Tournament",
        "category": "MPCA",
        "description": "Assign umpires/referees to fixtures. Final gazette.",
        "collection": "match_official_postings",
        "terminal_statuses": ["Published", "Rejected"],
    },
    {
        "key": "rate_card_revise",
        "label": "Rate-Card Revision",
        "category": "MPCA",
        "description": "Change fee / DA rates for officials & travel heads.",
        "collection": "rate_cards",
        "terminal_statuses": ["Published", "Rejected"],
    },
    {
        "key": "eligibility_rules_publish",
        "label": "Publish Season Eligibility Rules",
        "category": "MPCA",
        "description": "DOB fenceposts, medical requirements — signed for the season.",
        "collection": "tournament_master",
        "terminal_statuses": ["Published", "Rejected"],
    },
    {
        "key": "squad_submit_to_bcci",
        "label": "Approve BCCI Final Squad (submit-to-BCCI)",
        "category": "MPCA",
        "description": "MPCA sign-off before the final squad ships to BCCI.",
        "collection": "selection_funnels",
        "terminal_statuses": ["Submitted_To_BCCI", "Rejected"],
    },
    {
        "key": "reimbursement_release",
        "label": "Reimbursement Claim Payment Release",
        "category": "MPCA",
        "description": "MPCA releases UTR for approved reimbursement claims.",
        "collection": "reimbursement_claims",
        "terminal_statuses": ["Paid", "Rejected"],
    },
    {
        "key": "rbac_change",
        "label": "Manage User Roles / RBAC Change",
        "category": "MPCA",
        "description": "Add/remove user access. Two-person guard critical.",
        "collection": "rbac_change_requests",
        "terminal_statuses": ["Applied", "Rejected"],
    },
    {
        "key": "tournament_close",
        "label": "Close a Tournament (issue closure certificate)",
        "category": "MPCA",
        "description": "Final closure of a tournament + issuing the closure PDF.",
        "collection": "tournaments",
        "terminal_statuses": ["Closed", "Rejected"],
    },
    # ─────────────────── Division-owned ───────────────────
    {
        "key": "grant_claim_recommend",
        "label": "Recommend Grant Claim to MPCA (Division)",
        "category": "Division",
        "description": "Division recommends the claim to MPCA for approval.",
        "collection": "grant_claims",
        "terminal_statuses": ["Recommended", "Rejected"],
    },
    {
        "key": "division_camp_budget_lock",
        "label": "Self-Sanction Division Camp Budget",
        "category": "Division",
        "description": "Division locks its own camp budget before uploading invoices.",
        "collection": "tournament_budgets",
        "terminal_statuses": ["Division_Sanctioned", "Rejected"],
    },
    {
        "key": "reimbursement_submit_to_mpca",
        "label": "Submit Reimbursement Claim to MPCA",
        "category": "Division",
        "description": "Division bundles invoices and submits to MPCA.",
        "collection": "reimbursement_claims",
        "terminal_statuses": ["Submitted", "Rejected"],
    },
    {
        "key": "fixtures_publish",
        "label": "Publish Fixtures / Match Calendar (Division)",
        "category": "Division",
        "description": "Division locks the fixture list for its own tournament.",
        "collection": "tournament_matches",
        "terminal_statuses": ["Published", "Rejected"],
    },
    {
        "key": "player_registration_recommend",
        "label": "Recommend Player Registration to MPCA",
        "category": "Division",
        "description": "Division recommends a new player registration to MPCA.",
        "collection": "player_registrations",
        "terminal_statuses": ["Recommended", "Rejected"],
    },
    {
        "key": "division_squad_approve",
        "label": "Approve Division Squad Selection",
        "category": "Division",
        "description": "Division locks its squad for the tournament.",
        "collection": "selection_funnels",
        "terminal_statuses": ["Approved", "Rejected"],
    },
]


def _default_steps(wf: dict) -> list[dict]:
    """Empty maker/checker template — the user maps posts via /mc-admin."""
    terminal = (wf.get("terminal_statuses") or ["Approved"])[0]
    return [
        {
            "id": "submit",
            "from": "Draft",
            "to": "PendingReview",
            "action": "submit",
            "label": "Submit for review",
            "posts": [],
            "checker_mode": None,
            "requires_two_person": False,
            "needs_note": False,
            "returns": False,
        },
        {
            "id": "approve",
            "from": "PendingReview",
            "to": terminal,
            "action": "approve",
            "label": f"Approve · {terminal}",
            "posts": [],
            "checker_mode": "all",
            "requires_two_person": True,
            "needs_note": False,
            "returns": False,
        },
        {
            "id": "return",
            "from": "PendingReview",
            "to": "Draft",
            "action": "return",
            "label": "Return to maker",
            "posts": [],
            "checker_mode": None,
            "requires_two_person": False,
            "needs_note": True,
            "returns": True,
        },
        {
            "id": "reject",
            "from": "PendingReview",
            "to": "Rejected",
            "action": "reject",
            "label": "Reject",
            "posts": [],
            "checker_mode": None,
            "requires_two_person": True,
            "needs_note": True,
            "returns": False,
        },
    ]


async def seed_mc_workflows(db) -> dict:
    try:
        await db.mc_workflows.create_index("key", unique=True)
    except Exception:
        pass
    now = datetime.now(timezone.utc).isoformat()
    created, kept = [], []
    for wf in CANONICAL_WORKFLOWS:
        existing = await db.mc_workflows.find_one({"key": wf["key"]}, {"_id": 0})
        if existing:
            kept.append(wf["key"])
            continue
        doc = {
            **wf,
            "id_field": "id",
            "status_field": "mc_status",
            "chain_field": "mc_chain",
            "approvals_field": "mc_approvals",
            "initial_status": "Draft",
            "return_to": "Draft",
            "terminal_statuses": wf.get("terminal_statuses") or ["Approved", "Rejected"],
            "steps": _default_steps(wf),
            "enabled": True,
            "created_at": now,
            "updated_at": now,
        }
        await db.mc_workflows.insert_one(doc)
        created.append(wf["key"])
    return {"created": created, "kept": kept}
