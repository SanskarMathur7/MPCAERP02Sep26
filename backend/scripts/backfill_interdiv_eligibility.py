"""Feb 2026 · Backfill Inter-Divisional tournament_master rows with the
eligibility spec (DOB cut-offs, category, age_group, format, medical
requirement) from the sheet MPCA_Tournament_Registry_Eligibility.xlsx.

Idempotent — safe to run multiple times.
Usage:  python /app/backend/scripts/backfill_interdiv_eligibility.py
"""
import asyncio, os, sys
from datetime import datetime
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parents[1] / ".env")
from motor.motor_asyncio import AsyncIOMotorClient

# Row → (match_key, spec)
# match_key: match against tournament_master.name or short_name (case-insensitive).
# spec: gender · age_group · format · DOB fenceposts (ISO) · medical_required · max_out_of_state
SPEC = [
    ("MY Memorial Trophy",         {"gender":"Men",   "age_group":"Senior", "format":"Multi_Day", "dob_born_on_before":None,          "dob_born_on_after":None,          "max_out_of_state":None, "medical_required":False}),
    ("JN Bhaya Trophy",            {"gender":"Men",   "age_group":"Senior", "format":"Multi_Day", "dob_born_on_before":None,          "dob_born_on_after":None,          "max_out_of_state":None, "medical_required":False}),
    ("Madhavrao Scindia Trophy",   {"gender":"Men",   "age_group":"Senior", "format":"Ltd_Overs", "dob_born_on_before":None,          "dob_born_on_after":None,          "max_out_of_state":None, "medical_required":False}),
    ("JS Anand Trophy",            {"gender":"Women", "age_group":"Senior", "format":"Ltd_Overs", "dob_born_on_before":None,          "dob_born_on_after":None,          "max_out_of_state":0,    "medical_required":False}),
    ("Boys U-23 One Day Trophy",   {"gender":"Men",   "age_group":"U22",    "format":"Ltd_Overs", "dob_born_on_before":"2003-09-01",  "dob_born_on_after":None,          "max_out_of_state":None, "medical_required":False}),
    ("Parmanand Trophy",           {"gender":"Men",   "age_group":"U22",    "format":"Multi_Day", "dob_born_on_before":"2003-09-01",  "dob_born_on_after":None,          "max_out_of_state":None, "medical_required":False}),
    ("Hiralal Gaikwad Trophy",     {"gender":"Men",   "age_group":"U18",    "format":"Multi_Day", "dob_born_on_before":"2007-09-01",  "dob_born_on_after":None,          "max_out_of_state":None, "medical_required":False}),
    ("SM Khan Trophy",             {"gender":"Men",   "age_group":"U18",    "format":"Ltd_Overs", "dob_born_on_before":"2007-09-01",  "dob_born_on_after":None,          "max_out_of_state":None, "medical_required":False}),
    ("MM Jagdale Trophy",          {"gender":"Men",   "age_group":"U15",    "format":"Multi_Day", "dob_born_on_before":"2012-09-01",  "dob_born_on_after":"2010-09-01",  "max_out_of_state":None, "medical_required":True}),
    ("AW Kanmadikar Trophy",       {"gender":"Men",   "age_group":"U13",    "format":"Multi_Day", "dob_born_on_before":"2015-09-01",  "dob_born_on_after":"2012-09-01",  "max_out_of_state":None, "medical_required":True}),
    ("Girls U-18 Trophy",          {"gender":"Women", "age_group":"U18",    "format":"Ltd_Overs", "dob_born_on_before":"2007-09-01",  "dob_born_on_after":None,          "max_out_of_state":None, "medical_required":False}),
    ("CT Sarwate Trophy",          {"gender":"Men",   "age_group":"Senior", "format":"Multi_Day", "dob_born_on_before":None,          "dob_born_on_after":None,          "max_out_of_state":None, "medical_required":False}),
    ("CS Nayudu Trophy",           {"gender":"Men",   "age_group":"U22",    "format":"Multi_Day", "dob_born_on_before":"2003-09-01",  "dob_born_on_after":None,          "max_out_of_state":None, "medical_required":False}),
    ("Bhausaheb Nimbalkar Trophy", {"gender":"Men",   "age_group":"U18",    "format":"Multi_Day", "dob_born_on_before":"2007-09-01",  "dob_born_on_after":None,          "max_out_of_state":None, "medical_required":False}),
    ("Bhau Nivsarkar Trophy",      {"gender":"Men",   "age_group":"U15",    "format":"Multi_Day", "dob_born_on_before":"2012-09-01",  "dob_born_on_after":"2010-09-01",  "max_out_of_state":None, "medical_required":True}),
    ("Rameshwar Pratap Trophy",    {"gender":"Men",   "age_group":"U14",    "format":"Multi_Day", "dob_born_on_before":"2014-09-01",  "dob_born_on_after":"2011-09-01",  "max_out_of_state":None, "medical_required":True}),
]

# New trophy not present in DB — will be inserted with sort_order 115 (between
# Girls U-18 at 110 and CT Sarwate at 120).
GIRLS_U15 = {
    "name": "Girls U-15 Trophy",
    "short_name": "Girls U-15",
    "category": "Inter_Divisional",
    "description": "Inter-Divisional Women's Under-15 championship",
    "default_format": "OneDay_Womens",
    "is_active": True,
    "sort_order": 115,
    "eligibility_spec": {"gender":"Women","age_group":"U15","format":"Ltd_Overs","dob_born_on_before":"2013-09-01","dob_born_on_after":"2010-09-01","max_out_of_state":None,"medical_required":True},
}

async def main():
    c = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = c[os.environ["DB_NAME"]]
    ts = datetime.utcnow().isoformat() + "Z"
    updated, skipped = 0, 0
    for name, spec in SPEC:
        # Case-insensitive match on name OR short_name
        doc = await db.tournament_master.find_one({
            "category": "Inter_Divisional",
            "$or": [{"name": {"$regex": f"^{name}$", "$options": "i"}}],
        })
        if not doc:
            print(f"  · MISS  {name} — no matching row")
            skipped += 1
            continue
        await db.tournament_master.update_one(
            {"_id": doc["_id"]},
            {"$set": {"eligibility_spec": spec, "updated_at": ts}},
        )
        print(f"  · OK    {doc['name']:38s} · gender={spec['gender']:5s} · age={spec['age_group']:6s} · dob≤{spec['dob_born_on_before'] or '-'} · dob≥{spec['dob_born_on_after'] or '-'} · med={spec['medical_required']}")
        updated += 1
    # Insert Girls U-15 if missing
    exists = await db.tournament_master.find_one({"name": {"$regex": "^Girls U-15", "$options": "i"}, "category": "Inter_Divisional"})
    if not exists:
        import uuid
        GIRLS_U15["id"] = str(uuid.uuid4())
        GIRLS_U15["created_at"] = ts
        GIRLS_U15["updated_at"] = None
        await db.tournament_master.insert_one(GIRLS_U15)
        print(f"  · NEW   Girls U-15 Trophy · inserted at sort_order 115")
    else:
        await db.tournament_master.update_one({"_id": exists["_id"]}, {"$set": {"eligibility_spec": GIRLS_U15["eligibility_spec"], "updated_at": ts}})
        print(f"  · OK    Girls U-15 Trophy · updated eligibility_spec")
    print(f"\nSummary: {updated} updated · {skipped} skipped")
    c.close()

if __name__ == "__main__":
    asyncio.run(main())
