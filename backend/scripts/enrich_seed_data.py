"""MPCA-236 · Enrichment pass — add squad members + budget snapshots.

Runs AFTER seed_wiring_e2e. Adds 15 players to each empty squad (drawing from
the players collection) and computes+saves the Unified Budget snapshot for
each tournament so the wiring status derives correctly."""
import asyncio
import os
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import httpx
from motor.motor_asyncio import AsyncIOMotorClient

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME   = os.environ["DB_NAME"]
API       = "http://localhost:8001/api"


ROLES = ["Batsman", "Bowler", "All-rounder", "Wicketkeeper"]


async def enrich_squads(db):
    print("═══ Enriching squads with player members ═══")
    # Fetch all players once
    players = await db.players.find({}, {"_id": 0}).to_list(500)
    print(f"  Available player pool: {len(players)}")

    # Group by body
    by_body: dict = {}
    for p in players:
        by_body.setdefault(p.get("body_id"), []).append(p)
    # Fallback pool if a body has no players
    fallback = players[:20]

    updated = 0
    async for squad in db.squads.find({"members": {"$in": [[], None]}}):
        body_id = squad.get("body_id")
        pool = by_body.get(body_id, fallback)
        # Take up to 15 players
        selected = pool[:15] if len(pool) >= 15 else (pool + fallback[:15 - len(pool)])[:15]
        members = []
        for i, p in enumerate(selected):
            members.append({
                "player_id":       p["id"],
                "player_no":       p.get("player_no") or f"P-{i+1:03d}",
                "full_name":       p.get("full_name", f"Player {i+1}"),
                "role":            ROLES[i % len(ROLES)],
                "guest_subtype":   p.get("guest_subtype"),
                "is_captain":      i == 0,
                "is_vice_captain": i == 1,
                "is_keeper":       i == 2,
                "added_on":        datetime.now(timezone.utc).isoformat(),
            })
        await db.squads.update_one(
            {"id": squad["id"]},
            {"$set": {"members": members, "planned_size": len(members)}},
        )
        updated += 1
    print(f"  ✓ Squads enriched with 15 members each: {updated}")


async def compute_budgets():
    """Call the compute-and-save endpoint for every tournament."""
    print("═══ Computing + saving unified budget snapshots ═══")
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.get(f"{API}/tournaments")
        tournaments = r.json()
        ok = fail = 0
        for t in tournaments:
            tid = t["id"]
            try:
                cr = await client.post(f"{API}/tournaments/{tid}/unified-budget/compute?save=true")
                if cr.status_code == 200:
                    body = cr.json()
                    total = body.get("summary", {}).get("grand_total") or body.get("grand_total") or "—"
                    print(f"  ✓ {t['tournament_no']:20s} budget computed · total ₹{total}")
                    ok += 1
                else:
                    print(f"  ✗ {t['tournament_no']:20s} status={cr.status_code} · {cr.text[:120]}")
                    fail += 1
            except Exception as e:
                print(f"  ✗ {t['tournament_no']:20s} error: {e}")
                fail += 1
        print(f"\n  Budget compute · OK={ok} FAIL={fail}")


async def main():
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    await enrich_squads(db)
    await compute_budgets()
    client.close()
    print("\n✔ Enrichment complete.")


if __name__ == "__main__":
    asyncio.run(main())
