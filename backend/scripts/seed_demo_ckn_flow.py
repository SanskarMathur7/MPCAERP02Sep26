"""MPCA-234 · Seed a full-blown demo tournament for testing the Match Official
finance flow end-to-end. Uses a real historical MPCA trophy name:

  Col. C.K. Nayudu Memorial Trophy — Inter Division (Demo) · Multi-Day · Feb 2026

Populates:
  · 10 divisions in 2 pools (League + Knockouts) — host Bhopal for League, Indore for KO
  · 5 grounds (all Indore + Bhopal MPCA-approved venues)
  · 15 League fixtures (3 rounds × 5 matches) + 2 Semis + 1 Final
  · Squad size 18 · Senior · Multi-day format
  · Chandrakant Pandit assigned as Umpire on 4 matches (12 total days) — Accepted
  · Ashok Mehta assigned as Umpire on 4 matches (12 total days) — Pending
  · Budget snapshot LOCKED (v1) so progress bar reads "Tournament Running"

Run: python -m scripts.seed_demo_ckn_flow
"""
import asyncio
import os
import sys
import uuid
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from motor.motor_asyncio import AsyncIOMotorClient

from scripts.seed_utility_samples import (
    DIVS, DIV_CODES, round_robin, iso, now_iso, add_participations,
)


TROPHY_NAME = "Col. C.K. Nayudu Memorial Trophy — Inter Division (Demo)"
TROPHY_NO = "TRN-2026-27-CKN-DEMO"

GROUNDS = [
    {"venue_id": "holkar", "venue_name": "Holkar Stadium", "ground_name": "Main Ground", "city": "Indore"},
    {"venue_id": "epch",   "venue_name": "Emerald Heights",  "ground_name": "Ground A",   "city": "Indore"},
    {"venue_id": "bcpr",   "venue_name": "Bhopal Cricket Ground", "ground_name": "Main Ground", "city": "Bhopal"},
    {"venue_id": "aish",   "venue_name": "Aishbagh Stadium",  "ground_name": "Ground 1",   "city": "Bhopal"},
    {"venue_id": "hlst",   "venue_name": "Holkar Stadium",    "ground_name": "Ground 2",   "city": "Indore"},
]


async def create_ckn_tournament(db):
    league_pool_id = uuid.uuid4().hex[:8]
    ko_pool_id = uuid.uuid4().hex[:8]

    division_pools = [
        {"id": league_pool_id, "name": "League", "host_division_code": "DIV-BPL", "division_codes": DIV_CODES},
        {"id": ko_pool_id,     "name": "Knockouts", "host_division_code": "DIV-IND", "division_codes": DIV_CODES},
    ]

    tid = str(uuid.uuid4())
    doc = {
        "id": tid,
        "tournament_no": TROPHY_NO,
        "name": TROPHY_NAME,
        "scope": "Inter_Divisional",
        "type": "Inter_Divisional",
        "format": "Multi_Day",
        "start_date": "2026-02-01",
        "end_date": "2026-02-28",
        "fiscal_cycle": "2026-27",
        "host_body_id": "MPCA",
        "host_body_type": "State",
        "status": "Upcoming",
        "max_squad_size": 18,
        "setup_meta": {
            "category": "Senior Men",
            "age_group": "Senior",
            "format_group": "multi_day",
            "division_pools": division_pools,
            "district_pools": [],
            "grounds": GROUNDS,
        },
        "age_cap_years": None,
        "medical_required": True,
        "scheme_code": "2-D",
        "host_scheme_code": "2-D",
        "visiting_scheme_code": "2-C",
        "approval_chain": [],
        "plan_status": "Draft",
        "plan_approval_chain": [],
        "expense_events": [],
        "acceptance": {"acceptances": []},
        "created_by": "MPCA Secretariat",
        "created_at": now_iso(),
    }
    await db.tournaments.insert_one(doc)
    print(f"  ✓ Created {TROPHY_NO} · {TROPHY_NAME}")
    return {"id": tid, "name": TROPHY_NAME, "league_pool_id": league_pool_id, "ko_pool_id": ko_pool_id}


async def add_fixtures(db, t):
    """3 League rounds × 5 matches (4 days each) + 2 Semis + 1 Final. Base 2026-02-01."""
    tid = t["id"]
    rows = []
    order = 1
    rr = round_robin(DIV_CODES)[:3]
    base = datetime(2026, 2, 1)
    for r_idx, pairs in enumerate(rr):
        d_start = base + timedelta(days=r_idx * 6)
        d_end = d_start + timedelta(days=3)
        for i, (a, b) in enumerate(pairs):
            rows.append({
                "id": uuid.uuid4().hex,
                "tournament_id": tid,
                "label": f"League R{r_idx + 1} · M{i + 1}",
                "stage": "League",
                "pool_id": t["league_pool_id"],
                "pool_name": "League",
                "team_a": a, "team_b": b,
                "home_team": a, "away_team": b,
                "scheduled_date": iso(d_start),
                "from_date": iso(d_start),
                "to_date": iso(d_end),
                "days": 4,
                "actual_days": None,
                "nmd_manual": None,
                "other_pax": 0,
                "officials_ids": {"umpires": [], "scorers": [], "selectors": [], "observers": []},
                "squad": 18,
                "match_no": order,
                "venue_name": GROUNDS[i % len(GROUNDS)]["venue_name"],
                "ground_name": GROUNDS[i % len(GROUNDS)]["ground_name"],
                "venue_city": GROUNDS[i % len(GROUNDS)]["city"],
                "created_at": now_iso(),
            })
            order += 1

    # 2 Semis · Feb 20–23
    sf_start = datetime(2026, 2, 20); sf_end = datetime(2026, 2, 23)
    for a, b, label in [("Team SF1", "Team SF2", "Semi-final 1"), ("Team SF3", "Team SF4", "Semi-final 2")]:
        rows.append({
            "id": uuid.uuid4().hex, "tournament_id": tid,
            "label": label, "stage": "Knockouts",
            "pool_id": t["ko_pool_id"], "pool_name": "Knockouts",
            "team_a": a, "team_b": b, "home_team": a, "away_team": b,
            "scheduled_date": iso(sf_start), "from_date": iso(sf_start), "to_date": iso(sf_end),
            "days": 4, "actual_days": None, "nmd_manual": None, "other_pax": 0,
            "officials_ids": {"umpires": [], "scorers": [], "selectors": [], "observers": []},
            "squad": 18, "match_no": order,
            "venue_name": "Holkar Stadium", "ground_name": "Main Ground", "venue_city": "Indore",
            "created_at": now_iso(),
        })
        order += 1

    # Final · Feb 25–28
    rows.append({
        "id": uuid.uuid4().hex, "tournament_id": tid,
        "label": "Final", "stage": "Knockouts",
        "pool_id": t["ko_pool_id"], "pool_name": "Knockouts",
        "team_a": "SF1 Winner", "team_b": "SF2 Winner",
        "home_team": "SF1 Winner", "away_team": "SF2 Winner",
        "scheduled_date": "2026-02-25", "from_date": "2026-02-25", "to_date": "2026-02-28",
        "days": 4, "actual_days": None, "nmd_manual": None, "other_pax": 0,
        "officials_ids": {"umpires": [], "scorers": [], "selectors": [], "observers": []},
        "squad": 18, "match_no": order,
        "venue_name": "Holkar Stadium", "ground_name": "Main Ground", "venue_city": "Indore",
        "created_at": now_iso(),
    })
    await db.tournament_matches.insert_many(rows)
    print(f"  ✓ {len(rows)} matches (League 15 + KO 3)")


async def assign_officials(db, tid: str):
    """Assign Chandrakant Pandit (Accepted) + Ashok Mehta (Pending) as Umpires.
    Rates snapshot from active Multi-Day rate card officials_rates."""
    # Rate card for Multi_Day + Inter_Divisional
    rc = await db.rate_cards.find_one({"tournament_type": "Inter_Divisional", "format_group": "multi_day", "season": "2026-27"}, {"_id": 0})
    ump_fee = float(((rc or {}).get("officials_rates") or {}).get("Umpire", {}).get("fee_per_day") or 1000)
    ump_da = float(((rc or {}).get("officials_rates") or {}).get("Umpire", {}).get("da_per_day") or 700)

    officials = [
        ("Chandrakant Pandit", "Accepted"),
        ("Ashok Mehta",        "Pending"),
    ]
    rows = []
    for name, status in officials:
        off = await db.match_officials.find_one({"full_name": name}, {"_id": 0})
        if not off:
            print(f"  ⚠ Official '{name}' not found — skipping.")
            continue
        rows.append({
            "id": str(uuid.uuid4()),
            "tournament_id": tid,
            "tournament_name": TROPHY_NAME,
            "official_id": off["id"],
            "official_name": name,
            "role": "Umpire",
            "days": 12,        # 3 league matches × 4 days each
            "per_day_fee_inr": ump_fee,
            "per_day_da_inr": ump_da,
            "notes": "Central assignment for League phase",
            "acceptance_status": status,
            "assigned_at": now_iso(),
            "body_id": "MPCA", "body_type": "State",
            "created_at": now_iso(),
        })
    if rows:
        await db.tournament_match_officials.insert_many(rows)
    print(f"  ✓ {len(rows)} official assignments (Umpire × 12 days each)")


async def prepare_and_lock_budget(db, tid: str):
    """Directly write a locked unified_budget_snapshot onto the tournament so the
    progress bar reads 'Tournament Running'. Grand total is a plausible
    hand-computed value (₹1,25,000)."""
    snap = {
        "is_locked": True,
        "locked_version": 1,
        "locked_at": now_iso(),
        "locked_by": "MPCA Secretary (Demo Seed)",
        "grand_total_inr": 125000.0,
        "note": "Demo lock — full compute would run at prepare-budgets-unified",
    }
    await db.tournaments.update_one({"id": tid}, {"$set": {"unified_budget_snapshot": snap}})
    print("  ✓ Budget snapshot locked (v1 · ₹1,25,000)")


async def main():
    mongo_url = os.environ["MONGO_URL"]
    db_name = os.environ["DB_NAME"]
    c = AsyncIOMotorClient(mongo_url)
    db = c[db_name]

    # Purge any prior "CKN Demo" runs
    prior = await db.tournaments.find({"tournament_no": TROPHY_NO}, {"_id": 0, "id": 1}).to_list(50)
    for t in prior:
        tid = t["id"]
        await db.tournament_matches.delete_many({"tournament_id": tid})
        await db.tournament_participations.delete_many({"tournament_id": tid})
        await db.tournament_match_officials.delete_many({"tournament_id": tid})
        await db.match_official_da.delete_many({"tournament_id": tid})
        await db.tournaments.delete_one({"id": tid})
        print(f"  · Purged prior demo tournament {tid[:8]}")

    print("\n── Seeding CKN Memorial Demo ──────────────────────")
    t = await create_ckn_tournament(db)
    await add_fixtures(db, t)
    await add_participations(db, t["id"], t["name"])
    await assign_officials(db, t["id"])
    await prepare_and_lock_budget(db, t["id"])

    print("\n── Summary ─────────────────────────────────────────")
    print(f"  ID: {t['id']}")
    print(f"  URL (Match Official Finance): /my-finance/{t['id']}")
    print(f"  URL (MPCA Finance Console):   /tournaments/{t['id']}/finance")


if __name__ == "__main__":
    asyncio.run(main())
