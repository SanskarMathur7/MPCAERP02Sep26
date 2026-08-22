"""Iter 126 · One-off cleanup for user testing.

- Delete every tournament (test + real) and its cascading records.
- Delete DIV-GWL and DIV-IND grant claims (the non-tournament ones).

Run:  cd /app/backend && python -m scripts.iter126_cleanup
"""
import asyncio
import os
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv("/app/backend/.env")


async def main():
    mongo_url = os.environ["MONGO_URL"]
    db_name = os.environ["DB_NAME"]
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]

    # ─── 1. Tournaments + cascading data ───
    tournaments = await db.tournaments.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(500)
    tids = [t["id"] for t in tournaments]
    print(f"Tournaments to delete: {len(tids)}")
    for t in tournaments:
        print(f"  - {t['id'][:8]}  {t.get('name')}")

    cascade_cols = [
        "tournament_budgets", "tournament_invoices", "extra_expense_requests",
        "tournament_matches", "tournament_participations", "tournament_receipts",
        "tournament_reimbursement_claims", "tournament_plans",
        "squads", "tournament_da_forms", "match_official_assignments",
        "tournament_pool_records", "tournament_wiring_status",
        "tournament_grants", "tournament_officials",
    ]
    for col in cascade_cols:
        try:
            res = await db[col].delete_many({"tournament_id": {"$in": tids}})
            if res.deleted_count:
                print(f"  · {col}: {res.deleted_count}")
        except Exception as e:
            print(f"  ! {col} failed: {e}")

    # Also purge tournaments themselves
    res = await db.tournaments.delete_many({})
    print(f"tournaments: {res.deleted_count}")

    # ─── 2. Grant claims: DIV-GWL + DIV-IND ───
    body_codes = ["DIV-GWL", "DIV-IND"]
    claims = await db.grant_claims.find({"body_id": {"$in": body_codes}}, {"_id": 0, "id": 1, "claim_ref": 1, "body_id": 1}).to_list(500)
    print(f"Grant claims to delete: {len(claims)}")
    for c in claims:
        print(f"  - {c.get('claim_ref')} · {c.get('body_id')}")
    cids = [c["id"] for c in claims]
    if cids:
        # discussion threads + notifications should follow
        for col in ["grant_claim_discussions", "notifications"]:
            try:
                r = await db[col].delete_many({"claim_id": {"$in": cids}})
                if r.deleted_count:
                    print(f"  · {col}: {r.deleted_count}")
            except Exception:
                pass
        res = await db.grant_claims.delete_many({"id": {"$in": cids}})
        print(f"grant_claims: {res.deleted_count}")

    print("Done.")


if __name__ == "__main__":
    asyncio.run(main())
