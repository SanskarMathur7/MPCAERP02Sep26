"""Feb 2026 · Nuke ALL transactional / demo data.

Retains only the reference masters agreed with the user (option 1a):
  * users               — personas
  * bodies              — BCCI / MPCA / Divisions / Districts
  * roles               — RBAC roles
  * member_categories   — reference
  * reimbursement_schemes / grant_scheme_rates / scheme_activation_seasons — schemes register
  * rate_cards
  * tournament_master   — BCCI trophy master (reference)
  * tournament_wiring / tournament_wiring_snapshots — wiring config + versions
  * workflow_configs
  * system_config

Wipes everything else (tournaments, budgets, claims, invoices, players,
members, notifications, audit_log, discussions, disclosures, meetings,
elections, bank, vendors, procurement, DA forms, campaigns, uploads, etc.)
and resets every code_counter to 0.

Also sets `system_config.skip_transactional_seeds = True` so startup
seed_data() does NOT rehydrate the wiped collections on the next backend
restart. Delete that doc to re-enable auto-seed.

Usage:
    python /app/backend/scripts/purge_all_transactional.py
"""
import asyncio
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from motor.motor_asyncio import AsyncIOMotorClient


KEEP = {
    "users", "bodies", "roles", "member_categories",
    "reimbursement_schemes", "grant_scheme_rates", "scheme_activation_seasons",
    "rate_cards",
    "tournament_master",
    "tournament_wiring", "tournament_wiring_snapshots",
    "workflow_configs",
    "system_config",
    "counters", "code_counters",  # kept but re-zeroed below
}


async def main() -> None:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parents[1] / ".env")
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]

    total = 0
    all_cols = await db.list_collection_names()
    print("── Wiping transactional collections ──")
    for name in sorted(all_cols):
        if name in KEEP:
            continue
        try:
            res = await db[name].delete_many({})
            total += res.deleted_count
            print(f"  {name:40s} {res.deleted_count:>6} deleted")
        except Exception as e:
            print(f"  {name:40s} SKIP ({type(e).__name__}: {e})")

    print("\n── Reset code_counters to 0 ──")
    upd = await db.code_counters.update_many({}, {"$set": {"seq": 0}})
    print(f"  code_counters       matched={upd.matched_count}  modified={upd.modified_count}")
    upd2 = await db.counters.update_many({}, {"$set": {"seq": 0}})
    print(f"  counters            matched={upd2.matched_count}  modified={upd2.modified_count}")

    print("\n── Sentinels on system_config ──")
    for key, reason in [
        ("skip_seed_tournaments_and_grounds", "purge_all_transactional.py"),
        ("skip_transactional_seeds",          "purge_all_transactional.py"),
    ]:
        await db.system_config.update_one(
            {"key": key},
            {"$set": {"value": True, "reason": reason}},
            upsert=True,
        )
        print(f"  system_config.{key} = True")

    kept_summary = []
    for name in sorted(KEEP):
        try:
            n = await db[name].count_documents({})
            kept_summary.append(f"  {name:40s} {n:>6} kept")
        except Exception:
            pass
    print("\n── Retained reference masters ──")
    print("\n".join(kept_summary))

    print(f"\nTotal docs deleted: {total}")
    client.close()


if __name__ == "__main__":
    asyncio.run(main())
