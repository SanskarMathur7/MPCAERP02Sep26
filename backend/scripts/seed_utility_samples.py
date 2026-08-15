"""MPCA-227 · Purge all tournaments and seed the two sample tournaments from
`mpca-inter-division-utility (20).html`:

  1. Madhavrao Scindia Trophy — Inter Division (Sample) · Ltd Overs · Nov 2026
  2. MY Memorial Trophy — Inter Division (Sample) · Multi-day · Sep 2026

Both tournaments share:
  - 10 participating Divisions (all MPCA divisions)
  - 2 pools: League (host Indore) + Knockouts (host Gwalior)
  - Squad size 18, Category Men, Age Senior/Open
  - Fixtures generated per the utility's round-robin + knockouts logic
"""
import asyncio
import os
import sys
import uuid
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from motor.motor_asyncio import AsyncIOMotorClient


DIVS = [
    ("Bhopal", "DIV-BPL"),
    ("Chambal", "DIV-CHM"),
    ("Gwalior", "DIV-GWL"),
    ("Indore", "DIV-IND"),
    ("Jabalpur", "DIV-JBP"),
    ("Narmadapuram", "DIV-NMD"),
    ("Rewa", "DIV-RWA"),
    ("Sagar", "DIV-SAG"),
    ("Shahdol", "DIV-SHD"),
    ("Ujjain", "DIV-UJN"),
]
DIV_CODES = [c for _, c in DIVS]

# Purge these collections wholesale (tournament data)
PURGE = [
    "tournaments",
    "tournament_matches",
    "fixtures",
    "tournament_budgets",
    "tournament_participations",
    "tournament_invoices",
    "tournament_reimbursement_claims",
    "extra_expense_requests",
    "match_officials_da",
    "squads",
    "tournament_receipts",
    "closure_letters",
    "tournament_extra_expense",
    "tournament_notifications",
]


def round_robin(divs: list[str]) -> list[list[tuple[str, str]]]:
    """Standard round-robin scheduler — returns list of rounds; each round
    is a list of (team_a, team_b) tuples. For n teams (even), n-1 rounds,
    n/2 matches per round."""
    n = len(divs)
    assert n % 2 == 0, "even count required"
    ring = list(divs)
    rounds = []
    for _ in range(n - 1):
        pairs = []
        for i in range(n // 2):
            pairs.append((ring[i], ring[n - 1 - i]))
        rounds.append(pairs)
        # rotate keeping ring[0] fixed
        ring = [ring[0]] + [ring[-1]] + ring[1:-1]
    return rounds


def iso(d: datetime) -> str:
    return d.strftime("%Y-%m-%d")


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def clear_all(db):
    print("── Purging tournament data ─────────────────────────")
    for col in PURGE:
        res = await db[col].delete_many({})
        print(f"  · {col}: deleted {res.deleted_count}")
    # System config to skip auto-seeding on restart
    await db.system_config.update_one(
        {"key": "skip_seed_tournaments_and_grounds"},
        {"$set": {"key": "skip_seed_tournaments_and_grounds", "value": True}},
        upsert=True,
    )


async def create_tournament(
    db,
    *,
    name: str,
    fmt: str,               # valid Format enum value
    start: datetime,
    end: datetime,
    tournament_no: str,
) -> dict:
    """Create a tournament document with 2 pools, 10 divisions, MPCA host."""
    league_pool_id = uuid.uuid4().hex[:8]
    ko_pool_id = uuid.uuid4().hex[:8]

    # Pool shape as expected by frontend + compute engine:
    #   { id, name, division_codes, host_division_code }
    division_pools = [
        {
            "id": league_pool_id,
            "name": "League",
            "host_division_code": "DIV-IND",
            "division_codes": DIV_CODES,
        },
        {
            "id": ko_pool_id,
            "name": "Knockouts",
            "host_division_code": "DIV-GWL",
            "division_codes": DIV_CODES,
        },
    ]

    tid = str(uuid.uuid4())
    doc = {
        "id": tid,
        "tournament_no": tournament_no,
        "name": name,
        "scope": "Inter_Divisional",
        "type": "Inter_Divisional",
        "format": fmt,
        "start_date": iso(start),
        "end_date": iso(end),
        "fiscal_cycle": "2026-27",
        "host_body_id": "MPCA",
        "host_body_type": "State",
        "status": "Upcoming",
        "max_squad_size": 18,
        "setup_meta": {
            "category": "Senior Men",
            "age_group": "Senior",
            "format_group": "multi_day" if fmt == "Multi_Day" else "ltd_overs",
            "division_pools": division_pools,
            "district_pools": [],
        },
        "age_cap_years": None,
        "medical_required": False,
        "scheme_code": "2-D",
        "host_scheme_code": "2-D",
        "visiting_scheme_code": "2-C",
        "approval_chain": [],
        "plan_status": "Draft",
        "plan_approval_chain": [],
        "expense_events": [],
        "acceptance": {"acceptances": []},
        "created_by": "MPCA",
        "created_at": now_iso(),
    }
    await db.tournaments.insert_one(doc)
    print(f"  ✓ Created {tournament_no} · {name}")
    return {
        "id": tid, "name": name, "league_pool_id": league_pool_id,
        "ko_pool_id": ko_pool_id, "fmt": fmt,
    }


async def add_participations(db, tid: str, tname: str):
    """Insert one tournament_participation per Division per pool."""
    rows = []
    t = await db.tournaments.find_one({"id": tid}, {"_id": 0})
    for p in (t.get("setup_meta") or {}).get("division_pools") or []:
        pool_id = p["id"]
        pool_name = p["name"]
        host_code = p.get("host_division_code")
        for code in p["division_codes"]:
            body = await db.bodies.find_one({"code": code}, {"_id": 0})
            role = "Host" if code == host_code else "Visitor"
            rows.append({
                "id": str(uuid.uuid4()),
                "tournament_id": tid,
                "tournament_name": tname,
                "body_code": code,
                "body_name": (body or {}).get("name", code),
                "role": role,
                "pool_id": pool_id,
                "pool_name": pool_name,
                "acceptance_status": "Accepted",
                "removed_at": None,
                "created_at": now_iso(),
            })
    if rows:
        await db.tournament_participations.insert_many(rows)
    print(f"  ✓ {len(rows)} participations (Divisions × 2 pools)")


async def add_fixtures_ltd_overs(db, t: dict):
    """Madhavrao Scindia Trophy — Ltd Overs · 24 matches.
    League: 20 round-robin matches (4 rounds × 5 matches/round, 1 day each).
    Bracket: 2 semis + 1 final. 1 day each. Knockouts pool hosted by Gwalior.
    Dates start 2026-11-01."""
    tid = t["id"]
    league_pool_id = t["league_pool_id"]
    ko_pool_id = t["ko_pool_id"]
    rows = []
    order = 1

    # 4 rounds of 5 matches — take first 4 rounds of full RR schedule
    rr = round_robin(DIV_CODES)[:4]
    base = datetime(2026, 11, 1)
    for r_idx, pairs in enumerate(rr):
        # 1-day gap between rounds → dates: 11-01, 11-02, 11-03, 11-04 (all 5 matches on same date)
        d = base + timedelta(days=r_idx)
        for team_a, team_b in pairs:
            rows.append({
                "id": uuid.uuid4().hex,
                "tournament_id": tid,
                "label": f"League R{r_idx + 1}",
                "stage": "League",
                "pool_id": league_pool_id,
                "pool_name": "League",
                "team_a": team_a,
                "team_b": team_b,
                "home_team": team_a,
                "away_team": team_b,
                "scheduled_date": iso(d),
                "from_date": iso(d),
                "to_date": iso(d),
                "days": 1,
                "actual_days": None,
                "nmd_manual": None,
                "other_pax": 0,
                "officials_ids": {"umpires": [], "scorers": [], "selectors": [], "observers": []},
                "squad": 18,
                "match_no": order,
                "created_at": now_iso(),
            })
            order += 1

    # Semi-finals — Div[0] vs Div[3], Div[1] vs Div[2] on 2026-11-06
    sf_date = datetime(2026, 11, 6)
    for a_idx, b_idx, label in [(0, 3, "Semi-final 1"), (1, 2, "Semi-final 2")]:
        rows.append({
            "id": uuid.uuid4().hex,
            "tournament_id": tid,
            "label": label,
            "stage": "Knockouts",
            "pool_id": ko_pool_id,
            "pool_name": "Knockouts",
            "team_a": DIV_CODES[a_idx],
            "team_b": DIV_CODES[b_idx],
            "home_team": DIV_CODES[a_idx],
            "away_team": DIV_CODES[b_idx],
            "scheduled_date": iso(sf_date),
            "from_date": iso(sf_date),
            "to_date": iso(sf_date),
            "days": 1,
            "actual_days": None,
            "nmd_manual": None,
            "other_pax": 0,
            "officials_ids": {"umpires": [], "scorers": [], "selectors": [], "observers": []},
            "squad": 18,
            "match_no": order,
            "created_at": now_iso(),
        })
        order += 1

    # Final — Div[0] vs Div[1] on 2026-11-08
    final_date = datetime(2026, 11, 8)
    rows.append({
        "id": uuid.uuid4().hex,
        "tournament_id": tid,
        "label": "Final",
        "stage": "Knockouts",
        "pool_id": ko_pool_id,
        "pool_name": "Knockouts",
        "team_a": DIV_CODES[0],
        "team_b": DIV_CODES[1],
        "home_team": DIV_CODES[0],
        "away_team": DIV_CODES[1],
        "scheduled_date": iso(final_date),
        "from_date": iso(final_date),
        "to_date": iso(final_date),
        "days": 1,
        "actual_days": None,
        "nmd_manual": None,
        "other_pax": 0,
        "officials_ids": {"umpires": [], "scorers": [], "selectors": [], "observers": []},
        "squad": 18,
        "match_no": order,
        "created_at": now_iso(),
    })
    await db.tournament_matches.insert_many(rows)
    print(f"  ✓ {len(rows)} matches (Ltd Overs · Nov 2026)")


async def add_fixtures_multi_day(db, t: dict):
    """MY Memorial Trophy — Multi-day · 18 matches.
    League: 15 matches (3 rounds × 5 matches × 4 days each · 2-day gap between rounds).
    Bracket: 2 semis (4 days each) + 1 final (5 days).
    Base date 2026-09-01."""
    tid = t["id"]
    league_pool_id = t["league_pool_id"]
    ko_pool_id = t["ko_pool_id"]
    rows = []
    order = 1

    # 3 rounds — first 3 of full RR schedule
    rr = round_robin(DIV_CODES)[:3]
    base = datetime(2026, 9, 1)
    # Round n: dates start = base + n * (4 days match + 2-day gap) = base + n*6
    for r_idx, pairs in enumerate(rr):
        d_start = base + timedelta(days=r_idx * 6)
        d_end = d_start + timedelta(days=3)   # 4 days total
        for team_a, team_b in pairs:
            rows.append({
                "id": uuid.uuid4().hex,
                "tournament_id": tid,
                "label": f"League R{r_idx + 1}",
                "stage": "League",
                "pool_id": league_pool_id,
                "pool_name": "League",
                "team_a": team_a,
                "team_b": team_b,
                "home_team": team_a,
                "away_team": team_b,
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
                "created_at": now_iso(),
            })
            order += 1

    # Semi-finals — 2026-09-18 to 2026-09-21 (4 days)
    sf_start = datetime(2026, 9, 18)
    sf_end = datetime(2026, 9, 21)
    for a_idx, b_idx, label in [(0, 3, "Semi-final 1"), (1, 2, "Semi-final 2")]:
        rows.append({
            "id": uuid.uuid4().hex,
            "tournament_id": tid,
            "label": label,
            "stage": "Knockouts",
            "pool_id": ko_pool_id,
            "pool_name": "Knockouts",
            "team_a": DIV_CODES[a_idx],
            "team_b": DIV_CODES[b_idx],
            "home_team": DIV_CODES[a_idx],
            "away_team": DIV_CODES[b_idx],
            "scheduled_date": iso(sf_start),
            "from_date": iso(sf_start),
            "to_date": iso(sf_end),
            "days": 4,
            "actual_days": None,
            "nmd_manual": None,
            "other_pax": 0,
            "officials_ids": {"umpires": [], "scorers": [], "selectors": [], "observers": []},
            "squad": 18,
            "match_no": order,
            "created_at": now_iso(),
        })
        order += 1

    # Final — 2026-09-24 to 2026-09-28 (5 days)
    final_start = datetime(2026, 9, 24)
    final_end = datetime(2026, 9, 28)
    rows.append({
        "id": uuid.uuid4().hex,
        "tournament_id": tid,
        "label": "Final",
        "stage": "Knockouts",
        "pool_id": ko_pool_id,
        "pool_name": "Knockouts",
        "team_a": DIV_CODES[0],
        "team_b": DIV_CODES[1],
        "home_team": DIV_CODES[0],
        "away_team": DIV_CODES[1],
        "scheduled_date": iso(final_start),
        "from_date": iso(final_start),
        "to_date": iso(final_end),
        "days": 5,
        "actual_days": None,
        "nmd_manual": None,
        "other_pax": 0,
        "officials_ids": {"umpires": [], "scorers": [], "selectors": [], "observers": []},
        "squad": 18,
        "match_no": order,
        "created_at": now_iso(),
    })
    await db.tournament_matches.insert_many(rows)
    print(f"  ✓ {len(rows)} matches (Multi-day · Sep 2026)")


async def main():
    mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
    db_name = os.environ.get("DB_NAME", "test_database")
    c = AsyncIOMotorClient(mongo_url)
    db = c[db_name]

    await clear_all(db)

    print("\n── Creating sample tournaments ────────────────────")
    scindia = await create_tournament(
        db,
        name="Madhavrao Scindia Trophy — Inter Division (Sample)",
        fmt="One_Day",
        start=datetime(2026, 11, 1),
        end=datetime(2026, 11, 8),
        tournament_no="TRN-2026-27-001",
    )
    await add_participations(db, scindia["id"], scindia["name"])
    await add_fixtures_ltd_overs(db, scindia)

    print()
    my_mem = await create_tournament(
        db,
        name="MY Memorial Trophy — Inter Division (Sample)",
        fmt="Multi_Day",
        start=datetime(2026, 9, 1),
        end=datetime(2026, 9, 28),
        tournament_no="TRN-2026-27-002",
    )
    await add_participations(db, my_mem["id"], my_mem["name"])
    await add_fixtures_multi_day(db, my_mem)

    print("\n── Post-seed summary ───────────────────────────────")
    print("Tournaments:", await db.tournaments.count_documents({}))
    print("Matches:", await db.tournament_matches.count_documents({}))
    print("Participations:", await db.tournament_participations.count_documents({}))
    print()
    async for t in db.tournaments.find({}, {"_id": 0, "id": 1, "name": 1, "format": 1, "start_date": 1, "end_date": 1}):
        cnt = await db.tournament_matches.count_documents({"tournament_id": t["id"]})
        pcnt = await db.tournament_participations.count_documents({"tournament_id": t["id"]})
        print(f"  {t['id'][:8]} · {t['name']} · fmt={t['format']} · {t['start_date']}→{t['end_date']} · {cnt} matches · {pcnt} participations")


if __name__ == "__main__":
    asyncio.run(main())
