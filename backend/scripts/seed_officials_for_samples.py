"""MPCA-228 · Post match officials for the two sample tournaments and
allocate them across every match in the Match Calendar.

Two-phase workflow (matches MPCA-133+):

  Phase A · MPCA "posts" officials to the tournament — inserts one
  `tournament_match_officials` row per (tournament × official × role) with
  `acceptance_status='Accepted'` so they're immediately usable.

  Phase B · Allocate posted officials across the Match Calendar — for
  every fixture in `tournament_matches`, set `officials_ids` to a
  distributed selection: 2 umpires + 1 scorer + 1 selector + 1 observer
  per match, rotating through the accepted pool.
"""
import asyncio
import os
import sys
import uuid
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from motor.motor_asyncio import AsyncIOMotorClient


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# Per-role match-day fees (₹ per match-day) — from 2026-27 rate card
FEES = {
    "Umpire":   {"fee": 1000.0, "da": 500.0},
    "Scorer":   {"fee":  750.0, "da": 500.0},
    "Selector": {"fee":  500.0, "da": 500.0},
    "Observer": {"fee":  500.0, "da": 500.0},
}


async def post_officials(db, tid: str, tname: str, assigned_by: str = "Sanjeev Dua") -> list[dict]:
    """MPCA posts every active State-panel official (across Umpire/Scorer/
    Selector/Observer roles) as an Accepted assignment on the tournament.
    Returns the inserted rows."""
    # First: clean any prior assignments for this tournament (idempotent re-run)
    await db.tournament_match_officials.delete_many({"tournament_id": tid})

    rows = []
    for role in ("Umpire", "Scorer", "Selector", "Observer"):
        async for o in db.match_officials.find(
            {"role": role, "is_active": True},
            {"_id": 0, "id": 1, "full_name": 1, "body_id": 1},
        ):
            fee = FEES.get(role, {"fee": 500.0, "da": 500.0})
            rows.append({
                "id": str(uuid.uuid4()),
                "tournament_id": tid,
                "tournament_name": tname,
                "official_id": o["id"],
                "official_name": o.get("full_name") or o["id"][:8],
                "role": role,
                "body_id": o.get("body_id") or "MPCA",
                "days": 0,  # per-match days derived from Match Calendar
                "per_day_fee_inr": fee["fee"],
                "per_day_da_inr": fee["da"],
                "notes": "",
                "assigned_by": assigned_by,
                "assigned_at": now_iso(),
                "acceptance_status": "Accepted",
                "rejection_reason": None,
                "responded_at": now_iso(),
            })
    if rows:
        await db.tournament_match_officials.insert_many(rows)
    print(f"  ✓ Posted {len(rows)} officials to '{tname}'")
    return rows


def _distribute(pool: list[dict], per_match: int, start_idx: int) -> tuple[list[str], int]:
    """Rotate through a pool picking `per_match` official_ids. Returns
    the picked ids and the next index for rotation continuity."""
    if not pool:
        return [], start_idx
    picks = []
    for i in range(per_match):
        picks.append(pool[(start_idx + i) % len(pool)]["official_id"])
    return picks, (start_idx + per_match) % len(pool)


async def allocate_to_calendar(db, tid: str, assignments: list[dict]) -> int:
    """Round-robin distribute the accepted pool across every fixture:
        - 2 umpires per match
        - 1 scorer per match
        - 1 selector per match (League fixtures only — knockouts skip)
        - 1 observer per match (Knockouts fixtures only — leagues skip)"""
    by_role = {r: [a for a in assignments if a["role"] == r] for r in
               ("Umpire", "Scorer", "Selector", "Observer")}

    idx = {"Umpire": 0, "Scorer": 0, "Selector": 0, "Observer": 0}
    touched = 0
    async for m in db.tournament_matches.find({"tournament_id": tid}, {"_id": 0, "id": 1, "stage": 1, "label": 1}):
        stage = m.get("stage") or ""
        is_ko = stage == "Knockouts" or (m.get("label") or "").lower() in ("semi-final 1", "semi-final 2", "final")

        umpires, idx["Umpire"] = _distribute(by_role["Umpire"], 2, idx["Umpire"])
        scorers, idx["Scorer"] = _distribute(by_role["Scorer"], 1, idx["Scorer"])
        # Selectors mostly for League (talent scouting); Observers for Knockouts
        if is_ko:
            selectors = []
            observers, idx["Observer"] = _distribute(by_role["Observer"], 1, idx["Observer"])
        else:
            selectors, idx["Selector"] = _distribute(by_role["Selector"], 1, idx["Selector"])
            observers = []

        officials_ids = {
            "umpires": umpires,
            "scorers": scorers,
            "selectors": selectors,
            "observers": observers,
        }
        await db.tournament_matches.update_one(
            {"id": m["id"]},
            {"$set": {"officials_ids": officials_ids}},
        )
        touched += 1
    print(f"  ✓ Allocated officials across {touched} fixtures")
    return touched


async def main():
    mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
    db_name = os.environ.get("DB_NAME", "test_database")
    c = AsyncIOMotorClient(mongo_url)
    db = c[db_name]

    print("── Purging orphaned tournament_match_officials ─────")
    live_tids = set()
    async for t in db.tournaments.find({}, {"_id": 0, "id": 1}):
        live_tids.add(t["id"])
    orphan = await db.tournament_match_officials.count_documents({"tournament_id": {"$nin": list(live_tids)}})
    if orphan:
        r = await db.tournament_match_officials.delete_many({"tournament_id": {"$nin": list(live_tids)}})
        print(f"  · removed {r.deleted_count} orphaned assignments")
    else:
        print("  · no orphans")

    print("\n── Posting + allocating officials ──────────────────")
    async for t in db.tournaments.find({}, {"_id": 0, "id": 1, "name": 1}):
        print(f"\n{t['name']}")
        rows = await post_officials(db, t["id"], t["name"])
        await allocate_to_calendar(db, t["id"], rows)

    print("\n── Verification ────────────────────────────────────")
    async for t in db.tournaments.find({}, {"_id": 0, "id": 1, "name": 1}):
        posted = await db.tournament_match_officials.count_documents({"tournament_id": t["id"]})
        # Count fixtures with at least one umpire allocated
        allocated = await db.tournament_matches.count_documents({
            "tournament_id": t["id"],
            "officials_ids.umpires": {"$exists": True, "$not": {"$size": 0}},
        })
        total_matches = await db.tournament_matches.count_documents({"tournament_id": t["id"]})
        print(f"  {t['name']}: {posted} officials posted · {allocated}/{total_matches} matches allocated")


if __name__ == "__main__":
    asyncio.run(main())
