"""Feb 2026 · Backfill Max MP-Dom / Max Edu / Max Out-of-MP guest quotas
on the 17 Inter-Divisional tournament_master rows from the user's Excel
(MPCA_Tournament_Registry_Eligibility.xlsx).

Values are keyed by canonical `short_name` / `code` to survive minor
name variations. Also patches AW Kanmadikar age_grp to U13 to match the
Excel (was U14 in DB).

Usage:  python /app/backend/scripts/backfill_interdiv_quotas.py
"""
import asyncio
import os
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parents[1] / ".env")
from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402


# (name_prefix, MP-Dom, Edu, Out-of-MP)
QUOTAS = [
    ("MY Memorial",           2, 1, 1),
    ("JN Bhaya",              2, 1, 1),
    ("Madhavrao Scindia",     2, 1, 1),
    ("JS Anand",              2, 1, 0),
    ("Boys U-23 One Day",     3, 1, 0),
    ("Parmanand",             3, 1, 0),
    ("Hiralal Gaikwad",       3, 1, 0),
    ("SM Khan",               3, 1, 0),
    ("MM Jagdale",            3, 1, 0),
    ("AW Kanmadikar",         3, 1, 0),
    ("Girls U-18",            3, 1, 0),
    ("Girls U-15",            3, 1, 0),
    ("CT Sarwate",            2, 1, 1),
    ("CS Nayudu",             3, 1, 0),
    ("Bhausaheb Nimbalkar",   3, 1, 0),
    ("Bhau Nivsarkar",        3, 1, 0),
    ("Rameshwar Pratap",      3, 1, 0),
]

# Excel says AW Kanmadikar is U13, DB has U14. Correct the mismatch.
AGE_GRP_FIXES = {
    "AW Kanmadikar": "U13",
}


async def main():
    c = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = c[os.environ["DB_NAME"]]
    ts = datetime.utcnow().isoformat() + "Z"

    changed = 0
    misses = []
    for prefix, mp, edu, out_mp in QUOTAS:
        row = await db.tournament_master.find_one(
            {"category": "Inter_Divisional", "name": {"$regex": f"^{prefix}", "$options": "i"}},
            {"_id": 0, "id": 1, "name": 1, "max_guest_mp_domicile": 1,
             "max_guest_education": 1, "max_guest_out_of_mp": 1, "age_grp": 1},
        )
        if not row:
            misses.append(prefix)
            print(f"  · MISS  {prefix}")
            continue
        patch = {}
        if (row.get("max_guest_mp_domicile") or 0) != mp:
            patch["max_guest_mp_domicile"] = mp
        if (row.get("max_guest_education") or 0) != edu:
            patch["max_guest_education"] = edu
        if (row.get("max_guest_out_of_mp") or 0) != out_mp:
            patch["max_guest_out_of_mp"] = out_mp
        # Age-grp fix
        target_age = AGE_GRP_FIXES.get(prefix)
        if target_age and row.get("age_grp") != target_age:
            patch["age_grp"] = target_age
        if patch:
            patch["updated_at"] = ts
            await db.tournament_master.update_one({"id": row["id"]}, {"$set": patch})
            print(f"  · UPD   {row['name']:35s} · {patch}")
            changed += 1
        else:
            print(f"  · NOP   {row['name']}")

    print(f"\nSummary: {changed}/{len(QUOTAS)} rows patched")
    if misses:
        print(f"MISSING rows: {misses}")
    c.close()


if __name__ == "__main__":
    asyncio.run(main())
