"""Feb 2026 · Fix DOB fencepost inversion on single-cap Inter-Divisional
rows. The Excel places `01-Sep-2003` in the *Born On/After* column for
Boys U-23 (meaning: player must be born on-or-after that date → ≤22yo),
but the original backfill wrote it to `born_on_or_before`. That inverts
the meaning — under the buggy value an *over-22* player would be eligible.

This script swaps the value for U22/U18 rows that have `born_on_or_before`
set but `born_on_or_after` empty. Idempotent: rows already correct are
skipped.

Affected rows (from user's Excel):
  · Boys U-23 One Day Trophy    (U22 · born ≥ 2003-09-01)
  · Parmanand Trophy            (U22 · born ≥ 2003-09-01)
  · Hiralal Gaikwad Trophy      (U18 · born ≥ 2007-09-01)
  · SM Khan Trophy              (U18 · born ≥ 2007-09-01)
  · Girls U-18 Trophy           (U18 · born ≥ 2007-09-01)
  · CS Nayudu Trophy            (U22 · born ≥ 2003-09-01)
  · Bhausaheb Nimbalkar Trophy  (U18 · born ≥ 2007-09-01)
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


AFFECTED_AGE_GRPS = {"U22", "U18"}


async def main():
    c = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = c[os.environ["DB_NAME"]]
    ts = datetime.utcnow().isoformat() + "Z"

    docs = await db.tournament_master.find(
        {"category": "Inter_Divisional"}, {"_id": 0}
    ).to_list(200)

    changed = 0
    for d in docs:
        if d.get("age_grp") not in AFFECTED_AGE_GRPS:
            continue
        boob = (d.get("born_on_or_before") or "").strip()
        boa = (d.get("born_on_or_after") or "").strip()
        # Only swap when there's a value in boob but boa is empty.
        # (If both are set — U15 rows — leave them alone.)
        if boob and not boa:
            patch = {
                "born_on_or_before": None,
                "born_on_or_after": boob,
                "updated_at": ts,
            }
            # Mirror the same fix into the nested eligibility_spec so downstream
            # readers stay consistent.
            spec = dict(d.get("eligibility_spec") or {})
            if spec.get("dob_born_on_before") and not spec.get("dob_born_on_after"):
                spec["dob_born_on_after"] = spec["dob_born_on_before"]
                spec["dob_born_on_before"] = None
                patch["eligibility_spec"] = spec
            await db.tournament_master.update_one({"id": d["id"]}, {"$set": patch})
            print(f"  · FIX   {d['name']:35s} · swapped {boob} boob → boa")
            changed += 1
        else:
            print(f"  · NOP   {d['name']:35s} · boob={boob or '—'} boa={boa or '—'}")

    print(f"\nSummary: {changed} rows fixed")
    c.close()


if __name__ == "__main__":
    asyncio.run(main())
