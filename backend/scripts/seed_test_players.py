"""Iter 123 · Seed test players across all 10 MPCA Divisions.
────────────────────────────────────────────────────────────
Seeds ~30 players per Division (=300 total) so the eligibility engine and
squad-selection UI can be tested against varied age / gender / category
profiles matching the BCCI tournament registry.

Age-bracket distribution per Division (30 players):
  U-14 boys      2  (DOB ~2013)
  U-16 boys      4  (DOB ~2011)
  U-19 boys      6  (DOB ~2008)
  U-23 boys      6  (DOB ~2003)
  Senior men     4  (DOB ~1998)
  Women U-19     3  (DOB ~2008)
  Women Senior   3  (DOB ~1998)
  Veterans       2  (DOB ~1978)
Categories: mostly Local_MP; a few Born_Outside + 1 Guest per Division.
All players go directly to `status='Active'` so they show up in the squad
picker without needing manual approval. Idempotent — checks for existing
players by (body_id, full_name).
"""
import asyncio, os, random, uuid
from datetime import datetime, date, timezone
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv


load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

DIVISIONS = [
    ("DIV-IND", "Indore Division",       "Indore",      "IND"),
    ("DIV-JBP", "Jabalpur Division",     "Jabalpur",    "JBP"),
    ("DIV-SHD", "Shahdol Division",      "Shahdol",     "SHD"),
    ("DIV-NMD", "Narmadapuram Division", "Hoshangabad", "NMD"),
    ("DIV-SAG", "Sagar Division",        "Sagar",       "SAG"),
    ("DIV-GWL", "Gwalior Division",      "Gwalior",     "GWL"),
    ("DIV-CHM", "Chambal Division",      "Morena",      "CHM"),
    ("DIV-RWA", "Rewa Division",         "Rewa",        "RWA"),
    ("DIV-BPL", "Bhopal Division",       "Bhopal",      "BPL"),
    ("DIV-UJN", "Ujjain Division",       "Ujjain",      "UJN"),
]

FIRST_M = ["Aarav","Vihaan","Aditya","Reyansh","Krishna","Ishaan","Kabir","Shaurya",
           "Advait","Rudra","Arjun","Vivaan","Yash","Dhruv","Rohan","Karan",
           "Aryan","Aditya","Devansh","Nakul","Sameer","Tanmay","Uday","Varun"]
FIRST_F = ["Aanya","Diya","Saanvi","Anaya","Kiara","Myra","Ira","Riya","Aadya",
           "Anvi","Ishita","Pihu","Riddhi","Ananya","Meera","Nisha","Priya","Tanvi"]
LASTS   = ["Sharma","Verma","Yadav","Patel","Chouhan","Rajput","Jain","Mishra",
           "Trivedi","Dubey","Tiwari","Pandey","Iyer","Nair","Kumar","Singh",
           "Agrawal","Bansal","Gupta","Malviya"]


def _birth(year: int, month_range=(1, 12)) -> str:
    m = random.randint(*month_range)
    d = random.randint(1, 27)
    return f"{year:04d}-{m:02d}-{d:02d}"


# Roster mix per Division (30 total)
ROSTER_MIX = [
    # (count, gender, role, cat, dob_year, proficiency)
    (2, "Male",   "Batter",       "Local_MP",     2013, "Beginner"),   # U-14
    (2, "Male",   "Bowler",       "Local_MP",     2012, "Beginner"),   # U-14
    (3, "Male",   "Batter",       "Local_MP",     2011, "Club"),       # U-16
    (2, "Male",   "Bowler",       "Local_MP",     2010, "Club"),       # U-16
    (3, "Male",   "All_Rounder",  "Local_MP",     2008, "District"),   # U-19
    (2, "Male",   "Bowler",       "Local_MP",     2007, "District"),   # U-19
    (1, "Male",   "Wicket_Keeper","Born_Outside", 2008, "District"),   # U-19 outsider
    (3, "Male",   "Batter",       "Local_MP",     2003, "State"),      # U-23
    (2, "Male",   "Bowler",       "Local_MP",     2002, "State"),      # U-23
    (1, "Male",   "All_Rounder",  "Guest",        2003, "National"),   # U-23 guest
    (2, "Male",   "Batter",       "Local_MP",     1998, "State"),      # Senior
    (1, "Male",   "Bowler",       "Born_Outside", 1997, "State"),      # Senior outsider
    (1, "Male",   "Wicket_Keeper","Local_MP",     1996, "National"),   # Senior
    (2, "Female", "Batter",       "Local_MP",     2008, "District"),   # Women U-19
    (1, "Female", "Bowler",       "Local_MP",     2007, "District"),   # Women U-19
    (2, "Female", "All_Rounder",  "Local_MP",     1998, "State"),      # Women Senior
    (1, "Female", "Wicket_Keeper","Local_MP",     1997, "State"),      # Women Senior
    (2, "Male",   "Batter",       "Local_MP",     1978, "Club"),       # Veterans 40+
]


async def seed_players(db) -> dict:
    random.seed(42)  # deterministic
    now = datetime.now(timezone.utc).isoformat()
    created = 0
    skipped = 0
    per_div: dict[str, int] = {}
    for body_code, body_name, district, div_short in DIVISIONS:
        seq = 0
        for count, gender, role, category, birth_year, prof in ROSTER_MIX:
            first_pool = FIRST_F if gender == "Female" else FIRST_M
            for _ in range(count):
                first = random.choice(first_pool)
                last = random.choice(LASTS)
                name = f"{first} {last}"
                exists = await db.players.find_one({"body_id": body_code, "full_name": name})
                if exists:
                    skipped += 1
                    continue
                seq += 1
                doc = {
                    "id": str(uuid.uuid4()),
                    "player_id": f"MP/{div_short}/2026-27/T{seq:04d}",
                    "season_year": "2026-27",
                    "division_folder": body_code,
                    "body_id": body_code,
                    "full_name": name,
                    "father_name": f"Shri {random.choice(LASTS)}",
                    "mother_name": f"Smt. {random.choice(FIRST_F)} {last}",
                    "gender": gender,
                    "proficiency": prof,
                    "club_academy": f"{district} Cricket Academy",
                    "date_of_birth": _birth(birth_year),
                    "place_of_birth": district,
                    "domicile_state": "Madhya Pradesh",
                    "address_district": district,
                    "address_line": f"{random.randint(1,99)}, Cricket Colony, {district}",
                    "residency_since": f"{birth_year:04d}-06-01",
                    "category": category,
                    "guest_subtype": ("MP_Domicile_Senior" if category == "Guest" else None),
                    "guest_disclosure_signed": (category == "Guest"),
                    "role": role,
                    "batting_style": random.choice(["Right_Hand", "Left_Hand"]),
                    "bowling_style": ("Right_Arm_Off_Spin" if role in ("Bowler","All_Rounder") else "None"),
                    "height_cm": random.randint(150, 190),
                    "weight_kg": random.randint(45, 90),
                    "aadhaar_last4": f"{random.randint(1000,9999)}",
                    "contact_phone": f"9{random.randint(100000000, 999999999)}",
                    "contact_email": f"{first.lower()}.{last.lower()}@test.mpca",
                    "guardian_name": f"Shri {random.choice(LASTS)}",
                    "guardian_phone": f"9{random.randint(100000000, 999999999)}",
                    "court_order_flag": False,
                    "bcci_registered": random.random() > 0.7,
                    "is_employed": random.random() > 0.6,
                    "status": "Active",
                    "created_at": now,
                    "updated_at": now,
                    "extra_info": {"seeded_by": "seed_test_players.iter123"},
                }
                await db.players.insert_one(doc)
                created += 1
                per_div[body_code] = per_div.get(body_code, 0) + 1
    return {"created": created, "skipped": skipped, "per_division": per_div}


async def main():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]
    result = await seed_players(db)
    print(f"✓ Seed complete. Created {result['created']} · Skipped {result['skipped']}")
    for k, v in sorted(result["per_division"].items()):
        print(f"    {k}: {v} players")


if __name__ == "__main__":
    asyncio.run(main())
