"""scripts/backfill_tournament_status.py — Iter 108d.

One-shot sync: aligns the stored `tournaments.status` field with the
calendar-derived value used by the Tournament detail page.  Terminal states
(Cancelled, Completed) are preserved as-is; everything else is derived from
`start_date` / `end_date`:

    Upcoming         → today is >30 days before start
    Squad_Selection  → today is 0-30 days before start
    In_Progress      → today is between start and end
    Completed        → today is after end

Run:
    cd /app/backend && python scripts/backfill_tournament_status.py

The script is IDEMPOTENT — safe to run multiple times.  It only writes when
the derived status differs from the stored one, and every mutation logs to
`audit_log` with actor='system:status-backfill'.
"""
import asyncio
import os
import sys
import uuid
from datetime import datetime, timezone, date

# Make repo-relative imports work when script is executed directly
_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)

from core.infra import db  # noqa: E402


DAY_MS = 86400
TERMINAL_STATES = {"Cancelled", "Completed"}


def _parse_date(v) -> date | None:
    if not v:
        return None
    if isinstance(v, date) and not isinstance(v, datetime):
        return v
    if isinstance(v, datetime):
        return v.date()
    if isinstance(v, str):
        try:
            return datetime.strptime(v[:10], "%Y-%m-%d").date()
        except ValueError:
            return None
    return None


def derive_status(stored_status: str, start_date, end_date, today: date | None = None) -> str:
    """Python mirror of TournamentDetail.jsx · effectiveStatus.

    Terminal states are untouched; everything else derives from calendar.
    Returns the underscore-form used by DB filters (e.g. 'In_Progress').
    """
    if stored_status in TERMINAL_STATES:
        return stored_status
    sd = _parse_date(start_date)
    ed = _parse_date(end_date)
    if not sd or not ed:
        return "Upcoming"
    now = today or date.today()
    if now > ed:
        return "Completed"
    if now >= sd:
        return "In_Progress"
    days_to_start = (sd - now).days
    if days_to_start <= 30:
        return "Squad_Selection"
    return "Upcoming"


async def main() -> None:
    total = await db.tournaments.count_documents({})
    print(f"Scanning {total} tournaments …")
    changed = 0
    unchanged = 0
    skipped = 0
    audit_batch = []
    async for t in db.tournaments.find({}, {"id": 1, "name": 1, "status": 1, "start_date": 1, "end_date": 1, "_id": 0}):
        stored = t.get("status") or "Draft"
        derived = derive_status(stored, t.get("start_date"), t.get("end_date"))
        if derived == stored:
            unchanged += 1
            continue
        if not t.get("id"):
            skipped += 1
            continue
        # Update the tournament
        await db.tournaments.update_one(
            {"id": t["id"]},
            {"$set": {"status": derived, "updated_at": datetime.now(timezone.utc).isoformat()}},
        )
        audit_batch.append({
            "id": str(uuid.uuid4()),
            "actor": "system:status-backfill",
            "action": "tournament.status.derived",
            "entity_type": "tournament",
            "entity_id": t["id"],
            "delta": {"from": stored, "to": derived, "start_date": str(t.get("start_date")), "end_date": str(t.get("end_date"))},
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        changed += 1
        print(f"  · {t.get('name','?')[:48]:<50}  {stored:<18} → {derived}")
    if audit_batch:
        await db.audit_log.insert_many(audit_batch)
    print(f"\nDone.  changed={changed}  unchanged={unchanged}  skipped={skipped}")


if __name__ == "__main__":
    asyncio.run(main())
