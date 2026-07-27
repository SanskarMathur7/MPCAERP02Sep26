"""M39h · One-time purge of ALL tournament + ground data.

Preserves: bodies, members, players, employees, users, roles, schemes,
member_categories, banks, disclosures, resolutions, and everything unrelated
to the tournament/ground modules.

Usage:
    python /app/backend/scripts/purge_tournaments_grounds.py
"""
import asyncio
import os
import sys
from pathlib import Path

# Ensure /app/backend is on sys.path so this script can be run directly.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from motor.motor_asyncio import AsyncIOMotorClient


# Full nuke — every doc in these collections
NUKE_ENTIRELY = [
    "tournaments",
    "tournament_budgets",
    "tournament_closure_letters",
    "tournament_invoices",
    "tournament_matches",
    "tournament_participations",
    "tournament_receipts",
    "tournament_reimbursement_claims",
    "squads",
    "fixtures",
    "selection_funnels",
    "match_official_da",       # DA/TA claims are tied to tournaments
    "grounds",
    "venues",                  # legacy — dropped in M39e
    "ground_expenses",
    "extra_expense_requests",  # tournament-scoped
]

# Filtered wipe — only remove docs with a tournament_id (leave other data alone)
FILTERED_WIPES = [
    ("discussion_threads", {"tournament_id": {"$ne": None}}),
    ("discussion_messages", {"tournament_id": {"$ne": None}}),
    ("uploads", {"related_type": {"$in": [
        "tournament", "squad_signed_copy", "match_official_da",
        "tournament_receipt", "tournament_invoice",
    ]}}),
    ("audit_log", {"module": {"$in": ["tournament", "squad", "match_official_da", "ground"]}}),
    ("notifications", {"related_type": {"$in": [
        "tournament", "squad", "match_official_da", "ground",
    ]}}),
]

# Reset code_counters that autoincrement tournament / ground / squad numbers
COUNTER_KEYS_TO_RESET = [
    "tournament_no", "match_no", "squad_no", "ground_no", "venue_no",
    "invoice_no", "receipt_no", "closure_letter_no", "da_claim_no",
]


async def main() -> None:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parents[1] / ".env")
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]

    total = 0
    print("── Full-collection wipes ──")
    for name in NUKE_ENTIRELY:
        try:
            res = await db[name].delete_many({})
            total += res.deleted_count
            print(f"  {name:40s} {res.deleted_count:>6} deleted")
        except Exception as e:
            print(f"  {name:40s} SKIP ({type(e).__name__}: {e})")

    print("\n── Filtered wipes ──")
    for name, flt in FILTERED_WIPES:
        try:
            res = await db[name].delete_many(flt)
            total += res.deleted_count
            print(f"  {name:40s} {res.deleted_count:>6} deleted (filter={flt})")
        except Exception as e:
            print(f"  {name:40s} SKIP ({type(e).__name__}: {e})")

    print("\n── Reset code counters ──")
    for key in COUNTER_KEYS_TO_RESET:
        res = await db.code_counters.update_one({"key": key}, {"$set": {"seq": 0}})
        if res.matched_count:
            print(f"  counter '{key}' reset to 0")

    print(f"\n✔ Total docs deleted: {total}")

    # Mark the environment as user-purged so startup seed functions skip
    # rebuilding tournaments / grounds / venues data. Delete this doc to
    # re-enable the auto-seed.
    await db.system_config.update_one(
        {"key": "skip_seed_tournaments_and_grounds"},
        {"$set": {"value": True, "reason": "purge_tournaments_grounds.py"}},
        upsert=True,
    )
    print("✔ Skip-seed flag set on system_config.skip_seed_tournaments_and_grounds")

    client.close()


if __name__ == "__main__":
    asyncio.run(main())
