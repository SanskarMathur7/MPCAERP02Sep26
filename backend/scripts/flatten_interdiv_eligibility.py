"""Feb 2026 · Flatten eligibility_spec (nested) into top-level fields on
`tournament_master` Inter_Divisional rows so the Tournament Registry UI
can render the DOB cut-offs, gender, age group, and medical flag directly.

Previous script (`backfill_interdiv_eligibility.py`) wrote everything into a
nested `eligibility_spec` dict, but the frontend reads top-level fields
(`born_on_or_before`, `born_on_or_after`, `medical_required`, `age_grp`,
`play_type`, `gender`). Result: UI showed "—" for every DOB row.

This script is idempotent — top-level values already set are only updated
when the eligibility_spec has a value AND the top-level differs.

Usage:  python /app/backend/scripts/flatten_interdiv_eligibility.py
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


# Map spec.format → model.play_type literal
FORMAT_TO_PLAY_TYPE = {
    "Ltd_Overs": "Limited_Overs",
    "Limited_Overs": "Limited_Overs",
    "Multi_Day": "Multi_Day",
    "OneDay_Womens": "Limited_Overs",
    "T20_Womens": "Limited_Overs",
    "OneDay_Senior": "Limited_Overs",
    "OneDay_U19": "Limited_Overs",
    "OneDay_U23": "Limited_Overs",
    "T20_Senior": "Limited_Overs",
    "FourDay_Senior": "Multi_Day",
    "FourDay_U23": "Multi_Day",
    "FourDay_U19": "Multi_Day",
}


async def main():
    c = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = c[os.environ["DB_NAME"]]
    ts = datetime.utcnow().isoformat() + "Z"

    docs = await db.tournament_master.find({"category": "Inter_Divisional"}).to_list(200)
    changed = 0
    for d in docs:
        spec = d.get("eligibility_spec") or {}
        if not spec:
            print(f"  · SKIP  {d.get('name'):38s} — no eligibility_spec")
            continue
        patch = {}

        # DOB fenceposts
        s_boob = spec.get("dob_born_on_before")
        s_boa = spec.get("dob_born_on_after")
        if s_boob and d.get("born_on_or_before") != s_boob:
            patch["born_on_or_before"] = s_boob
        if s_boa and d.get("born_on_or_after") != s_boa:
            patch["born_on_or_after"] = s_boa

        # Gender
        s_gender = spec.get("gender")
        if s_gender and d.get("gender") != s_gender:
            patch["gender"] = s_gender

        # Age group
        s_age = spec.get("age_group")
        if s_age and d.get("age_grp") != s_age:
            patch["age_grp"] = s_age

        # Play type (map spec.format → literal)
        s_fmt = spec.get("format")
        pt = FORMAT_TO_PLAY_TYPE.get(s_fmt) if s_fmt else None
        if pt and d.get("play_type") != pt:
            patch["play_type"] = pt

        # Medical
        s_med = spec.get("medical_required")
        if s_med is not None and d.get("medical_required") != s_med:
            patch["medical_required"] = bool(s_med)

        # Max out-of-state — no direct field in UI; leave for now (max_guest_out_of_mp
        # is a separate concept — MP-domicile guest slots — we don't collapse here.)

        if patch:
            patch["updated_at"] = ts
            await db.tournament_master.update_one({"_id": d["_id"]}, {"$set": patch})
            print(f"  · UPD   {d.get('name'):38s} · {patch}")
            changed += 1
        else:
            print(f"  · NOP   {d.get('name'):38s}")

    print(f"\nSummary: {changed}/{len(docs)} Inter_Divisional rows flattened")
    c.close()


if __name__ == "__main__":
    asyncio.run(main())
