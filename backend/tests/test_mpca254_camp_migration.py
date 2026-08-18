"""MPCA-254 · Ship B — Legacy camps → first-class tournaments migration.

Contract:
  1. migrate_camps_to_tournaments() promotes every un-migrated camp
     (except Reciprocal_Match) into db.tournaments and stamps the camp
     with migrated_to_tournament_id.
  2. Idempotent — a second call skips already-migrated camps and
     doesn't create duplicates.
  3. Reciprocal_Match camps are explicitly skipped (removed from wiring).
  4. Every promoted tournament has a valid tournament_type_code that
     resolves through the wiring engine.
"""
import os
import sys
import asyncio
import uuid
from datetime import datetime, timezone

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from core.infra import db   # noqa: E402
from routes.camps import migrate_camps_to_tournaments   # noqa: E402


def _fresh_camp(camp_type: str, **extras) -> dict:
    """A minimally-shaped legacy camp document."""
    return {
        "id":            str(uuid.uuid4()),
        "camp_no":       f"CMP-2025-26-TEST-{uuid.uuid4().hex[:6]}",
        "name":          f"Test Camp {camp_type}",
        "camp_type":     camp_type,
        "body_id":       "DIV-IND",
        "scheme_code":   {"Periodical_Coaching": "3-A", "Vacation_Camp": "3-B",
                          "Reciprocal_Match": "3-C", "Pre_Tournament_Camp": "3-D"}[camp_type],
        "fiscal_cycle":  "2025-26",
        "start_date":    "2026-04-01",
        "end_date":      "2026-04-08",
        "venue_hint":    "Test Ground",
        "planned_participants": 20,
        "status":        "Scheduled",
        "created_at":    datetime.now(timezone.utc).isoformat(),
        **extras,
    }


async def _cleanup(ids):
    """Remove test camps + any tournaments they spawned."""
    tids = []
    for cid in ids:
        c = await db.camps.find_one({"id": cid}, {"migrated_to_tournament_id": 1})
        if c and c.get("migrated_to_tournament_id"):
            tids.append(c["migrated_to_tournament_id"])
    if ids:  await db.camps.delete_many({"id": {"$in": ids}})
    if tids: await db.tournaments.delete_many({"id": {"$in": tids}})


def test_migration_promotes_camps():
    """Fresh camps get a matching tournament with correct type_code."""
    async def run():
        peri = _fresh_camp("Periodical_Coaching")
        vaca = _fresh_camp("Vacation_Camp")
        pre  = _fresh_camp("Pre_Tournament_Camp",
                           inter_division_tournament_id="parent-tid-xyz")
        recip = _fresh_camp("Reciprocal_Match")
        await db.camps.insert_many([peri, vaca, pre, recip])

        try:
            result = await migrate_camps_to_tournaments()

            assert result["promoted"] >= 3, f"expected 3 promoted, got {result['promoted']}"
            assert result["skipped_reciprocal"] >= 1

            # Each promotable camp now carries a pointer + a matching tournament exists.
            for camp_id, expected_code in [
                (peri["id"],  "periodical_coaching_camp"),
                (vaca["id"],  "vacation_camp"),
                (pre["id"],   "pre_tournament_camp"),
            ]:
                c = await db.camps.find_one({"id": camp_id}, {"_id": 0})
                assert c.get("migrated_to_tournament_id"), f"{camp_id} not stamped"
                t = await db.tournaments.find_one({"id": c["migrated_to_tournament_id"]}, {"_id": 0})
                assert t is not None, f"tournament for {camp_id} not created"
                assert t["tournament_type_code"] == expected_code
                assert t.get("migrated_from_camp_id") == camp_id

            # Reciprocal_Match was NOT promoted.
            r = await db.camps.find_one({"id": recip["id"]}, {"_id": 0})
            assert not r.get("migrated_to_tournament_id"), "Reciprocal_Match should not migrate"
        finally:
            await _cleanup([peri["id"], vaca["id"], pre["id"], recip["id"]])

    asyncio.get_event_loop().run_until_complete(run())


def test_migration_is_idempotent():
    """Second call promotes zero new camps and creates zero new tournaments."""
    async def run():
        peri = _fresh_camp("Periodical_Coaching")
        await db.camps.insert_one(peri)
        try:
            first = await migrate_camps_to_tournaments()
            assert first["promoted"] >= 1

            tid1 = (await db.camps.find_one({"id": peri["id"]}))["migrated_to_tournament_id"]

            # Re-run — should promote zero, no new tournaments.
            second = await migrate_camps_to_tournaments()
            # Second call may still promote OTHER camps in the DB but not this one.
            tid2 = (await db.camps.find_one({"id": peri["id"]}))["migrated_to_tournament_id"]
            assert tid1 == tid2, "Migration must not re-promote an already-migrated camp"

            # Confirm no duplicate tournament created for this camp.
            dup = await db.tournaments.count_documents({"migrated_from_camp_id": peri["id"]})
            assert dup == 1, f"expected 1 tournament for this camp, got {dup}"
            _ = second   # silence unused
        finally:
            await _cleanup([peri["id"]])

    asyncio.get_event_loop().run_until_complete(run())
