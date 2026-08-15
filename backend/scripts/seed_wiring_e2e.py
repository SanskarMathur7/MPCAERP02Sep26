"""MPCA-235 · Wipe & Reseed 8 Sample Tournaments for Wiring E2E Testing.

Deletes every tournament-related record and reseeds ONE richly-populated
tournament per wiring type (8 total) — so the Tournament Wiring flow can be
tested end-to-end. No claims are submitted; everything sits in Draft/Upcoming
so the user can drive the workflow manually.

Run: `python -m scripts.seed_wiring_e2e` from /app/backend
"""
import asyncio
import os
import sys
import uuid
from datetime import datetime, timezone, timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from motor.motor_asyncio import AsyncIOMotorClient

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME   = os.environ["DB_NAME"]


# Which collections to wipe (leave bodies, rate cards, master registry, wiring)
COLLECTIONS_TO_WIPE = [
    "tournaments",
    "tournament_matches",
    "tournament_participations",
    "tournament_pools",
    "tournament_match_officials",
    "tournament_budgets",
    "tournament_receipts",
    "tournament_documents",
    "tournament_da_forms",
    "match_official_da",
    "tournament_reimbursements",
    "reimbursement_claims",
    "squads",
    "camps",
    "unified_budgets",
    "tournament_wiring_audit",
    "tournament_wiring_snapshots",
]


def _iso(d: datetime) -> str:
    return d.strftime("%Y-%m-%d")


async def wipe(db):
    print("═══ Wiping collections ═══")
    for coll in COLLECTIONS_TO_WIPE:
        r = await db[coll].delete_many({})
        print(f"  {coll:40s} deleted={r.deleted_count}")


# ─────────────── Common defaults ───────────────

CYCLE = "2026-27"
NOW   = datetime.now(timezone.utc)
START_BASE = datetime(2026, 8, 15)


def _tournament(
    trn_no: str,
    name: str,
    short: str,
    fmt: str,
    scope: str,
    ttype: str,
    ttype_code: str,
    host_body: str,
    days_offset: int,
    duration_days: int,
    scheme_code: str = None,
    host_scheme: str = None,
    visiting_scheme: str = None,
    is_womens: bool = False,
    setup_meta: dict = None,
    input_variables: dict = None,
    notes: str = "",
    status: str = "Upcoming",
    trophy: str = None,
):
    start = START_BASE + timedelta(days=days_offset)
    end   = start + timedelta(days=duration_days - 1)
    return {
        "id":                    str(uuid.uuid4()),
        "tournament_no":         trn_no,
        "name":                  name,
        "short_name":            short,
        "trophy_name":           trophy,
        "format":                fmt,                     # Multi_Day / One_Day / T20
        "scope":                 scope,                   # Inter_Divisional / Inter_District / Championship / Invitational
        "tournament_type":       ttype,                   # MPCA_InterDivisional / MPCA_Championship / BCCI / Invitational / Other
        "tournament_type_code":  ttype_code,
        "fiscal_cycle":          CYCLE,
        "host_body_id":          host_body,
        "start_date":            _iso(start),
        "end_date":              _iso(end),
        "status":                status,
        "scheme_code":           scheme_code,
        "host_scheme_code":      host_scheme,
        "visiting_scheme_code":  visiting_scheme,
        "is_womens":             is_womens,
        "max_squad_size":        16 if "camp" in name.lower() else 18,
        "medical_required":      ttype in ("BCCI", "MPCA_InterDivisional"),
        "setup_meta":            setup_meta or {},
        "input_variables":       input_variables or {},
        "default_scheme_inputs": {},
        "acceptance":            {"required_from": [], "entries": [], "status": "Not_Required"},
        "calendar_fixed":        False,
        "expense_events":        [],
        "approval_chain":        [],
        "plan_status":           "Draft",
        "plan_approval_chain":   [],
        "notes":                 notes,
        "created_by":            "system_seed",
        "created_at":            NOW.isoformat(),
    }


def _pool(tid: str, host_body: str, name: str, division_codes=None, district_codes=None):
    return {
        "id":                str(uuid.uuid4()),
        "tournament_id":     tid,
        "pool_id":           name.lower().replace(" ", "_"),
        "name":              name,
        "division_codes":    division_codes or [],
        "district_codes":    district_codes or [],
        "created_at":        NOW.isoformat(),
    }


def _match(tid: str, day: int, mno: str, host_body: str, home: str, away: str, when: datetime, venue: str, pool_id: str = None):
    return {
        "id":              str(uuid.uuid4()),
        "tournament_id":   tid,
        "match_no":        mno,
        "day":             day,
        "date":            _iso(when),
        "start_time":      "09:30",
        "home_body_id":    home,
        "away_body_id":    away,
        "home_team_name":  home,
        "away_team_name":  away,
        "venue_name":      venue,
        "pool_id":         pool_id,
        "status":          "Scheduled",
        "created_at":      NOW.isoformat(),
    }


def _official(tid: str, name: str, role: str, phone: str, body: str, per_day_fee_inr: float = 2500, per_day_da_inr: float = 1500):
    return {
        "id":               str(uuid.uuid4()),
        "official_id":      f"OFF-{uuid.uuid4().hex[:8]}",  # required by unified budget compute
        "tournament_id":    tid,
        "name":             name,
        "role":             role,           # Umpire / Scorer / Referee / Physio
        "phone":            phone,
        "email":            None,
        "body_code":        body,
        "per_day_fee_inr":  per_day_fee_inr,
        "per_day_da_inr":   per_day_da_inr,
        "matches_assigned": [],
        "created_at":       NOW.isoformat(),
    }


def _squad(tid: str, body_id: str, coach: str, manager: str, size: int = 15, team_name: str = None):
    """Empty squad row — user can add members via the UI to test the flow."""
    return {
        "id":                 str(uuid.uuid4()),
        "tournament_id":      tid,
        "body_id":            body_id,
        "team_name":          team_name or body_id,   # required by Squad model
        "coach_name":         coach,
        "manager_name":       manager,
        "planned_size":       size,
        "members":            [],
        "submission_status":  "Draft",
        "signed_copy_url":    None,
        "created_at":         NOW.isoformat(),
    }


def _camp(tid_link, name, body, camp_type, days_offset, duration_days, scheme="3-D"):
    start = START_BASE + timedelta(days=days_offset)
    end   = start + timedelta(days=duration_days - 1)
    return {
        "id":                              str(uuid.uuid4()),
        "camp_no":                         f"CMP-{CYCLE}-{uuid.uuid4().hex[:4]}",
        "name":                            name,
        "camp_type":                       camp_type,
        "body_id":                         body,
        "scheme_code":                     scheme,
        "start_date":                      _iso(start),
        "end_date":                        _iso(end),
        "venue_hint":                      f"{body} Cricket Ground",
        "coach_name":                      "Shri Amay Khurasiya",
        "trainer_name":                    "Shri Vinay Kumar",
        "manager_name":                    "Shri Sanjay Jagdale",
        "target_age_group":                "U-19",
        "planned_participants":            30,
        "fiscal_cycle":                    CYCLE,
        "status":                          "Draft",
        "reciprocal_visitors":             [],
        "auto_created_from_tournament":    False,
        "inter_division_tournament_id":    tid_link,
        "inter_division_tournament_name":  None,
        "created_by":                      "system_seed",
        "created_at":                      NOW.isoformat(),
    }


# ─────────────── The 8 sample tournaments ───────────────

async def seed_tournaments(db):
    print("═══ Seeding 8 sample tournaments across all wiring types ═══")

    tournaments = []
    all_docs = {
        "pools":     [],
        "matches":   [],
        "officials": [],
        "squads":    [],
        "camps":     [],
    }

    # ─── 1 · BCCI ───────────────────────────────────────────────────
    bcci_t = _tournament(
        trn_no="TRN-2026-27-001",
        name="Ranji Trophy · Elite · MPCA 2026-27",
        short="Ranji Elite",
        trophy="Ranji Trophy",
        fmt="Multi_Day",
        scope="Inter_Divisional",
        ttype="BCCI",
        ttype_code="bcci_ranji_elite",
        host_body="MPCA",
        days_offset=15,
        duration_days=4,
        scheme_code="2-A",
        host_scheme="2-A",
        visiting_scheme=None,
        setup_meta={"category": "Male", "age_group": "Open", "match_type": "First-Class"},
        input_variables={"days_per_match": 4, "matches": 6, "squad_size": 15, "officials": 4},
        notes="Elite Group C · MP hosts 3 home fixtures at Holkar Stadium, Indore.",
    )
    tournaments.append(bcci_t)
    # Home fixtures (BCCI: MP + visiting states)
    for i, opp in enumerate(["Gujarat", "Odisha", "Vidarbha"]):
        all_docs["matches"].append(_match(bcci_t["id"], i + 1, f"M{i+1}",
                                          "MPCA", "Madhya Pradesh", opp,
                                          START_BASE + timedelta(days=15 + i * 5),
                                          "Holkar Stadium, Indore"))
    # Officials (BCCI-appointed umpires + MPCA scorers)
    for name, role, phone in [
        ("Shri Rohit Bindiya",  "Umpire",  "+91-90000-11111"),
        ("Shri Ulhas Gandhe",   "Umpire",  "+91-90000-11112"),
        ("Shri VS Vishen",      "Referee", "+91-90000-11113"),
        ("Shri Prakash Bhale",  "Scorer",  "+91-90000-11114"),
    ]:
        all_docs["officials"].append(_official(bcci_t["id"], name, role, phone, "MPCA"))
    # MPCA squad (manual per wiring · Manual_PDF mode)
    all_docs["squads"].append(_squad(bcci_t["id"], "MPCA", "Shri Chandrakant Pandit", "Shri Sanjay Jagdale", 16))

    # ─── 2 · Inter-Division ────────────────────────────────────────
    intdiv_t = _tournament(
        trn_no="TRN-2026-27-002",
        name="MY Memorial Trophy · 2026-27",
        short="MY Memorial",
        trophy="MY Memorial",
        fmt="Multi_Day",
        scope="Inter_Divisional",
        ttype="MPCA_InterDivisional",
        ttype_code="inter_div_men_open",
        host_body="DIV-BPL",
        days_offset=30,
        duration_days=3,
        scheme_code="2-D",
        host_scheme="2-D",
        visiting_scheme="2-C",
        setup_meta={"category": "Male", "age_group": "Open", "match_type": "3-Day"},
        input_variables={"days_per_match": 3, "matches": 6, "squad_size": 15, "officials": 4,
                         "teams": 4, "pools": 2},
        notes="Full 10-division tournament in 2 pools of 5. Semi-finals + Final.",
    )
    tournaments.append(intdiv_t)
    # 2 pools of 5 divisions each
    all_docs["pools"].append(_pool(intdiv_t["id"], "DIV-BPL", "Pool A",
        division_codes=["DIV-BPL", "DIV-IND", "DIV-JBP", "DIV-UJN", "DIV-GWL"]))
    all_docs["pools"].append(_pool(intdiv_t["id"], "DIV-BPL", "Pool B",
        division_codes=["DIV-CHM", "DIV-SAG", "DIV-NMD", "DIV-RWA", "DIV-SHD"]))
    # League matches (a few sample fixtures) — Pool A
    fixtures = [
        ("DIV-BPL", "DIV-IND"),
        ("DIV-JBP", "DIV-UJN"),
        ("DIV-GWL", "DIV-BPL"),
        ("DIV-CHM", "DIV-SAG"),
        ("DIV-NMD", "DIV-RWA"),
    ]
    for i, (home, away) in enumerate(fixtures):
        all_docs["matches"].append(_match(intdiv_t["id"], i + 1, f"M{i+1}",
                                          "DIV-BPL", home, away,
                                          START_BASE + timedelta(days=30 + i * 4),
                                          "Roshanpura Ground, Bhopal"))
    # Officials — MPCA-posted for Inter-Div
    for name, role, phone in [
        ("Shri Anil Chaudhary",   "Umpire", "+91-90000-21111"),
        ("Shri KN Ananthapadmanabhan", "Umpire", "+91-90000-21112"),
        ("Shri Yeshwant Barde",   "Scorer", "+91-90000-21113"),
        ("Dr. Amol Karkare",      "Physio", "+91-90000-21114"),
    ]:
        all_docs["officials"].append(_official(intdiv_t["id"], name, role, phone, "MPCA"))
    # One squad per participating division (register-linked mode)
    for body, coach, mgr in [
        ("DIV-BPL", "Shri Neeraj Patel",  "Shri Naman Ojha"),
        ("DIV-IND", "Shri Sanjay Sharma", "Shri Amay Khurasiya"),
        ("DIV-JBP", "Shri Ashutosh Singh","Shri Devendra Bundela"),
        ("DIV-UJN", "Shri Vinit Bhatnagar","Shri Sunil Ainapure"),
    ]:
        all_docs["squads"].append(_squad(intdiv_t["id"], body, coach, mgr))

    # ─── 3 · Pre-Tournament Camp (linked to Inter-Div) ─────────────
    all_docs["camps"].append(_camp(
        tid_link=intdiv_t["id"],
        name="Bhopal Pre-Tournament Camp · MY Memorial 2026-27",
        body="DIV-BPL",
        camp_type="Pre_Tournament_Camp",
        days_offset=15,
        duration_days=10,
        scheme="3-D",
    ))
    all_docs["camps"][-1]["inter_division_tournament_name"] = intdiv_t["name"]

    # ─── 4 · Inter-District ─────────────────────────────────────────
    intdist_t = _tournament(
        trn_no="TRN-2026-27-003",
        name="Indore Division Inter-District Championship 2026-27",
        short="Indore Inter-Dist",
        trophy="Indore Inter-District",
        fmt="Multi_Day",
        scope="Inter_District",
        ttype="MPCA_Championship",
        ttype_code="inter_district_men_open",
        host_body="DIV-IND",
        days_offset=50,
        duration_days=3,
        scheme_code="2-B",
        host_scheme="2-B",
        visiting_scheme="2-C",
        setup_meta={"category": "Male", "age_group": "Open"},
        input_variables={"days_per_match": 3, "matches": 5, "squad_size": 15, "officials": 3,
                         "teams": 8, "pools": 2},
        notes="Full 8-district tournament — Indore Division. Two pools + knockout.",
    )
    tournaments.append(intdist_t)
    all_docs["pools"].append(_pool(intdist_t["id"], "DIV-IND", "Pool A",
        district_codes=["DIST-INDO-IND", "DIST-DHAR-IND", "DIST-BURH-IND", "DIST-BARW-IND"]))
    all_docs["pools"].append(_pool(intdist_t["id"], "DIV-IND", "Pool B",
        district_codes=["DIST-ALIR-IND", "DIST-KHAN-IND", "DIST-KHAR-IND", "DIST-JHAB-IND"]))
    for i, (home, away) in enumerate([
        ("DIST-INDO-IND", "DIST-DHAR-IND"),
        ("DIST-BURH-IND", "DIST-BARW-IND"),
        ("DIST-ALIR-IND", "DIST-KHAN-IND"),
        ("DIST-KHAR-IND", "DIST-JHAB-IND"),
        ("DIST-INDO-IND", "DIST-BURH-IND"),
    ]):
        all_docs["matches"].append(_match(intdist_t["id"], i + 1, f"M{i+1}",
                                          "DIV-IND", home, away,
                                          START_BASE + timedelta(days=50 + i * 3),
                                          "USHA Raje Ground, Indore"))
    for name, role, phone in [
        ("Shri Rajesh Chourasia", "Umpire", "+91-90000-31111"),
        ("Shri Suresh Marotia",   "Umpire", "+91-90000-31112"),
        ("Shri Anil Bopche",      "Scorer", "+91-90000-31113"),
    ]:
        all_docs["officials"].append(_official(intdist_t["id"], name, role, phone, "DIV-IND"))
    for body in ["DIST-INDO-IND", "DIST-DHAR-IND", "DIST-BURH-IND"]:
        all_docs["squads"].append(_squad(intdist_t["id"], body, "Shri Local Coach", "Shri Local Manager"))

    # ─── 5 · Inter-School ───────────────────────────────────────────
    school_t = _tournament(
        trn_no="TRN-2026-27-004",
        name="Bhopal Division Inter-School Tournament 2026-27",
        short="Bhopal Inter-School",
        trophy="Bhopal Inter-School",
        fmt="One_Day",
        scope="Championship",
        ttype="MPCA_Championship",
        ttype_code="inter_school",
        host_body="DIV-BPL",
        days_offset=70,
        duration_days=1,
        scheme_code="2-D",
        host_scheme="2-D",
        visiting_scheme=None,
        setup_meta={"category": "Male", "age_group": "U-19", "match_type": "One-Day"},
        input_variables={"squad_size": 15, "days": 1, "matches": 3},
        notes="Bhopal Division · U-19 · knock-out format. Winners qualify for state-level.",
    )
    tournaments.append(school_t)
    all_docs["squads"].append(_squad(school_t["id"], "DIV-BPL", "Shri Rakesh Bahre", "Shri Vinay Kumar"))

    # ─── 6 · Inter-Club (A Grade) ───────────────────────────────────
    club_t = _tournament(
        trn_no="TRN-2026-27-005",
        name="Indore Division Inter-Club Tournament ('A' Grade) 2026-27",
        short="Indore Inter-Club",
        trophy="Indore A-Grade Cup",
        fmt="Multi_Day",
        scope="Championship",
        ttype="MPCA_Championship",
        ttype_code="inter_club_two_day_ko",
        host_body="DIV-IND",
        days_offset=85,
        duration_days=2,
        scheme_code="2-D",
        host_scheme="2-D",
        visiting_scheme=None,
        setup_meta={"category": "Male", "age_group": "Open", "match_type": "2-Day KO"},
        input_variables={"squad_size": 15, "days": 2, "matches": 2, "format": "two_day_ko"},
        notes="Indore Division · 'A' Grade clubs only · two-day knockout (per Scheme pp.14-15). "
              "One-day / league-cum-knockout formats are NOT reimbursed.",
    )
    tournaments.append(club_t)
    all_docs["squads"].append(_squad(club_t["id"], "DIV-IND", "Shri Naman Ojha", "Shri Amay Khurasiya"))

    # ─── 7 · Periodical Coaching Camp ───────────────────────────────
    coaching_t = _tournament(
        trn_no="TRN-2026-27-006",
        name="Ujjain Division Periodical Coaching Camp · Rural Players 2026-27",
        short="Ujjain Coaching Camp",
        trophy=None,
        fmt="Multi_Day",
        scope="Championship",
        ttype="MPCA_Championship",
        ttype_code="periodical_coaching_camp",
        host_body="DIV-UJN",
        days_offset=100,
        duration_days=15,
        scheme_code="3-A",
        host_scheme="3-A",
        visiting_scheme=None,
        setup_meta={"category": "Male", "age_group": "U-16", "type": "Rural coaching camp"},
        input_variables={"days": 15, "planned_participants": 40, "coach_count": 3},
        notes="Camp for district/rural players who cannot practise at the divisional HQ. Scheme p.16.",
    )
    tournaments.append(coaching_t)
    all_docs["squads"].append(_squad(coaching_t["id"], "DIV-UJN", "Shri Devendra Bundela", "Shri Ravi Bhagat", 30))

    # ─── 8 · Vacation Camp ──────────────────────────────────────────
    vacation_t = _tournament(
        trn_no="TRN-2026-27-007",
        name="Jabalpur Division Summer Vacation Camp 2026-27",
        short="Jabalpur Vacation Camp",
        trophy=None,
        fmt="Multi_Day",
        scope="Championship",
        ttype="MPCA_Championship",
        ttype_code="vacation_camp",
        host_body="DIV-JBP",
        days_offset=120,
        duration_days=21,
        scheme_code="3-B",
        host_scheme="3-B",
        visiting_scheme=None,
        setup_meta={"category": "Male + Female", "age_group": "U-14", "type": "Vacation camp"},
        input_variables={"days": 21, "planned_participants": 60, "coach_count": 4},
        notes="Summer break camp · U-14 boys & girls. Divisional Secretary must certify no fee was charged.",
    )
    tournaments.append(vacation_t)
    all_docs["squads"].append(_squad(vacation_t["id"], "DIV-JBP", "Shri Ashutosh Singh", "Shri Devendra Malviya", 50))

    # ─── Bulk insert ─────────────────────────────────────────────────
    if tournaments:
        await db.tournaments.insert_many(tournaments)
        print(f"  ✓ tournaments inserted: {len(tournaments)}")
    for coll_name in ("pools", "matches", "officials", "squads", "camps"):
        docs = all_docs[coll_name]
        if not docs:
            continue
        target = {
            "pools":     "tournament_pools",
            "matches":   "tournament_matches",
            "officials": "tournament_match_officials",
            "squads":    "squads",
            "camps":     "camps",
        }[coll_name]
        await db[target].insert_many(docs)
        print(f"  ✓ {target:30s} inserted: {len(docs)}")

    # Summary
    print("\n═══ Seed summary ═══")
    for t in tournaments:
        print(f"  {t['tournament_no']:20s} {t['name']}")
    print(f"\n  Type distribution: {sorted({t['tournament_type'] for t in tournaments})}")
    print(f"  Scope distribution: {sorted({t['scope'] for t in tournaments})}")


async def main():
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    await wipe(db)
    await seed_tournaments(db)
    client.close()
    print("\n✔ Done — all 8 wiring-type tournaments ready for manual E2E testing.")


if __name__ == "__main__":
    asyncio.run(main())
