"""H3 · MongoDB indexes.

Every collection was previously queried with no indexes, so each `find`/`find_one`
did a full collection scan. On a single event loop that CPU cost is paid on the
request path for every user. This module declares indexes on the fields actually
used in queries/sorts and creates them at startup.

`create_index` is idempotent — calling it on an existing, identical index is a
no-op — so this is safe to run on every boot. Each index is created independently
and wrapped in try/except: a single failure (e.g. a pre-existing duplicate that
blocks a unique build on legacy data) is logged and skipped rather than crashing
startup. Unique `id` indexes also give the reference-number work (H6) a hard
database-level guarantee against duplicates.
"""
from core.infra import db, logger

# (collection, keys, unique). keys is a list of (field, direction) tuples.
_INDEX_SPECS = [
    # ---- membership / people ----
    ("members", [("id", 1)], True),
    ("members", [("category", 1)], False),
    ("members", [("body_id", 1), ("status", 1)], False),
    ("member_categories", [("id", 1)], True),
    ("players", [("id", 1)], True),
    ("players", [("player_id", 1)], False),
    ("players", [("body_id", 1), ("status", 1)], False),
    ("players", [("first_registration_year", 1)], False),
    ("employees", [("id", 1)], True),
    ("employees", [("body_id", 1)], False),

    # ---- org structure ----
    ("bodies", [("code", 1)], True),
    ("bodies", [("body_type", 1)], False),
    ("bodies", [("parent_code", 1)], False),

    # ---- finance ----
    ("bank_accounts", [("id", 1)], True),
    ("bank_txns", [("id", 1)], True),
    ("bank_txns", [("account_id", 1), ("date", -1)], False),
    ("claims", [("id", 1)], True),
    ("claims", [("fiscal_cycle", 1), ("status", 1)], False),
    ("claims", [("body_id", 1)], False),
    ("grant_claims", [("id", 1)], True),
    ("grant_claims", [("fiscal_cycle", 1), ("body_id", 1)], False),
    ("division_grants", [("id", 1)], True),
    ("division_grants", [("fiscal_cycle", 1), ("status", 1)], False),
    ("vouchers", [("id", 1)], True),
    ("vouchers", [("fiscal_cycle", 1), ("status", 1)], False),
    ("fee_invoices", [("id", 1)], True),
    ("fee_invoices", [("status", 1)], False),
    ("purchase_orders", [("id", 1)], True),
    ("purchase_orders", [("fiscal_cycle", 1)], False),
    ("vendors", [("id", 1)], True),
    ("vendor_bills", [("id", 1)], True),
    ("vendor_bills", [("fiscal_cycle", 1), ("vendor_id", 1)], False),
    ("extra_expense_requests", [("id", 1)], True),
    ("extra_expense_requests", [("fiscal_cycle", 1)], False),
    ("reimbursement_claims", [("id", 1)], True),
    ("reimbursement_schemes", [("id", 1)], True),
    ("payroll_registers", [("id", 1)], True),
    ("payroll_registers", [("fiscal_cycle", 1)], False),

    # ---- procurement / transfers ----
    ("procurement_requests", [("id", 1)], True),
    ("procurement_requests", [("fiscal_cycle", 1), ("body_id", 1)], False),
    ("transfer_requests", [("id", 1)], True),
    ("transfer_requests", [("fiscal_cycle", 1)], False),

    # ---- tournaments ----
    ("tournaments", [("id", 1)], True),
    ("tournaments", [("fiscal_cycle", 1), ("status", 1)], False),
    ("tournament_budgets", [("id", 1)], True),
    ("tournament_budgets", [("fiscal_cycle", 1)], False),
    ("tournament_invoices", [("id", 1)], True),
    ("tournament_invoices", [("invoice_ref", 1)], False),
    ("tournament_reimbursement_claims", [("id", 1)], True),
    ("tournament_reimbursement_claims", [("fiscal_cycle", 1)], False),
    ("match_official_da", [("id", 1)], True),
    ("match_official_da", [("da_ref", 1)], False),
    ("match_officials", [("id", 1)], True),
    ("fixtures", [("id", 1)], True),
    ("fixtures", [("fixture_no", 1)], False),
    ("fixtures", [("status", 1)], False),
    ("squads", [("id", 1)], True),
    ("selection_funnels", [("season_year", 1)], False),
    ("season_registrations", [("season_year", 1), ("body_id", 1)], False),
    ("camps", [("id", 1)], True),
    ("camps", [("fiscal_cycle", 1)], False),

    # ---- venues / grounds ----
    ("venues", [("id", 1)], True),
    ("grounds", [("id", 1)], True),
    ("grounds", [("venue_id", 1)], False),
    ("ground_expenses", [("id", 1)], True),
    ("ground_expenses", [("ground_id", 1), ("fiscal_cycle", 1)], False),

    # ---- governance / docs / misc ----
    ("meetings", [("id", 1)], True),
    ("meetings", [("meeting_type", 1), ("status", 1)], False),
    ("elections", [("id", 1)], True),
    ("elections", [("status", 1)], False),
    ("disclosures", [("id", 1)], True),
    ("compliance_items", [("id", 1)], True),
    ("compliance_items", [("status", 1)], False),
    ("assets", [("id", 1)], True),
    ("assets", [("body_id", 1)], False),
    ("documents", [("id", 1)], True),
    ("documents", [("body_id", 1)], False),
    ("uploads", [("id", 1)], True),
    ("notifications", [("id", 1)], True),
]


async def ensure_indexes() -> None:
    created = 0
    for coll, keys, unique in _INDEX_SPECS:
        try:
            await db[coll].create_index(keys, unique=unique)
            created += 1
        except Exception as e:  # never let index creation crash startup
            logger.warning("ensure_indexes: skipped %s %s (%s)", coll, keys, e)
    logger.info("ensure_indexes: %d/%d indexes ensured", created, len(_INDEX_SPECS))
