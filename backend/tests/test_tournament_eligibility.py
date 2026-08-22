"""Feb 2026 · Tournament Player Eligibility Engine + endpoint · tests.

Tests the pure engine (`core.tournament_eligibility.check_player_for_tournament`)
in isolation, plus the HTTP endpoint `GET /tournaments/{tid}/eligible-players`
end-to-end via a seeded MongoDB fixture.
"""
import asyncio
import os
import sys
import uuid
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from core.tournament_eligibility import check_player_for_tournament  # noqa: E402


# ────────────────────── Pure engine tests ──────────────────────

MASTER_U15_MED = {
    "gender": "Men",
    "age_grp": "U15",
    "born_on_or_before": "2012-09-01",
    "born_on_or_after": "2010-09-01",
    "medical_required": True,
}

MASTER_WOMENS_SENIOR = {
    "gender": "Women",
    "age_grp": "Senior",
    "born_on_or_before": None,
    "born_on_or_after": None,
    "medical_required": False,
}


def _mk_player(**kw):
    base = {"id": str(uuid.uuid4()), "full_name": "Test Player", "gender": "Male",
            "dob": "2011-05-14", "medical_cleared_at": None}
    base.update(kw)
    return base


def test_eligible_happy_path_u15():
    p = _mk_player(dob="2011-05-14", medical_cleared_at="2026-01-15T10:00:00Z")
    ok, reasons = check_player_for_tournament(p, MASTER_U15_MED)
    assert ok, reasons
    assert reasons == []


def test_over_age_blocked():
    # Born too early — outside born_on_or_after fencepost
    p = _mk_player(dob="2009-01-01", medical_cleared_at="2026-01-15T10:00:00Z")
    ok, reasons = check_player_for_tournament(p, MASTER_U15_MED)
    assert not ok
    assert any("over_age" in r for r in reasons)


def test_under_age_blocked():
    # Born too late — after born_on_or_before fencepost
    p = _mk_player(dob="2015-01-01", medical_cleared_at="2026-01-15T10:00:00Z")
    ok, reasons = check_player_for_tournament(p, MASTER_U15_MED)
    assert not ok
    assert any("under_age" in r for r in reasons)


def test_gender_mismatch():
    p = _mk_player(dob="2011-05-14", gender="Female", medical_cleared_at="2026-01-15T10:00:00Z")
    ok, reasons = check_player_for_tournament(p, MASTER_U15_MED)
    assert not ok
    assert any("gender_mismatch" in r for r in reasons)


def test_medical_missing_when_required():
    p = _mk_player(dob="2011-05-14", medical_cleared_at="")
    ok, reasons = check_player_for_tournament(p, MASTER_U15_MED)
    assert not ok
    assert any("medical_missing" in r for r in reasons)


def test_medical_ignored_when_not_required():
    # JS Anand Trophy (Women's Senior) has no medical requirement
    p = _mk_player(dob="1998-05-14", gender="Female", medical_cleared_at="")
    ok, reasons = check_player_for_tournament(p, MASTER_WOMENS_SENIOR)
    assert ok, reasons


def test_dob_missing_when_fencepost_set():
    p = _mk_player(dob="", medical_cleared_at="2026-01-15T10:00:00Z")
    p.pop("dob", None)
    ok, reasons = check_player_for_tournament(p, MASTER_U15_MED)
    assert not ok
    assert any("dob_missing" in r for r in reasons)


def test_no_master_row_returns_eligible():
    # BCCI / Championship / non-InterDiv → master is None → no enforcement
    p = _mk_player()
    ok, reasons = check_player_for_tournament(p, None)
    assert ok
    assert reasons == []


def test_multiple_reasons_returned():
    p = _mk_player(dob="2009-01-01", gender="Female", medical_cleared_at="")
    ok, reasons = check_player_for_tournament(p, MASTER_U15_MED)
    assert not ok
    # 3 failing rules: gender + over_age + medical
    assert len(reasons) == 3


# ────────────────────── HTTP endpoint · end-to-end ──────────────────────

def _api_url():
    env = Path("/app/frontend/.env").read_text()
    for ln in env.splitlines():
        if ln.startswith("REACT_APP_BACKEND_URL="):
            return ln.split("=", 1)[1].strip() + "/api"
    raise RuntimeError("REACT_APP_BACKEND_URL not set")


@pytest.fixture(scope="module")
def seeded_ids():
    """Insert a temporary tournament + 3 players, yield ids, tear down after."""
    from motor.motor_asyncio import AsyncIOMotorClient
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parents[1] / ".env")

    async def _seed():
        c = AsyncIOMotorClient(os.environ["MONGO_URL"])
        db = c[os.environ["DB_NAME"]]
        tid = str(uuid.uuid4())
        await db.tournaments.insert_one({
            "id": tid,
            "name": "MM Jagdale Trophy",  # matches seeded master row (U15 · med required)
            "scope": "Inter_Divisional",
            "tournament_type": "MPCA_InterDivisional",
            "status": "Upcoming",
            "fiscal_cycle": "2026-27",
            "host_body_id": "MPCA",
        })
        pids = []
        # 1. Eligible (2011 U15 boy · medical cleared)
        p1 = str(uuid.uuid4())
        await db.players.insert_one({
            "id": p1, "player_id": "TEST/2026/E1", "full_name": "Eligible Boy",
            "body_id": "DIV-IND", "gender": "Male", "dob": "2011-05-14",
            "medical_cleared_at": "2026-01-15T10:00:00Z", "status": "Active",
        })
        pids.append(p1)
        # 2. Over-age (born 2009)
        p2 = str(uuid.uuid4())
        await db.players.insert_one({
            "id": p2, "player_id": "TEST/2026/E2", "full_name": "Over Age Boy",
            "body_id": "DIV-IND", "gender": "Male", "dob": "2009-05-14",
            "medical_cleared_at": "2026-01-15T10:00:00Z", "status": "Active",
        })
        pids.append(p2)
        # 3. Medical missing
        p3 = str(uuid.uuid4())
        await db.players.insert_one({
            "id": p3, "player_id": "TEST/2026/E3", "full_name": "No Medical Boy",
            "body_id": "DIV-IND", "gender": "Male", "dob": "2011-06-14",
            "medical_cleared_at": "", "status": "Active",
        })
        pids.append(p3)
        c.close()
        return tid, pids

    async def _cleanup(tid, pids):
        c = AsyncIOMotorClient(os.environ["MONGO_URL"])
        db = c[os.environ["DB_NAME"]]
        await db.tournaments.delete_one({"id": tid})
        for pid in pids:
            await db.players.delete_one({"id": pid})
        c.close()

    tid, pids = asyncio.get_event_loop().run_until_complete(_seed())
    yield tid, pids
    asyncio.get_event_loop().run_until_complete(_cleanup(tid, pids))


def test_endpoint_returns_split_and_reasons(seeded_ids):
    import requests
    tid, pids = seeded_ids
    r = requests.get(f"{_api_url()}/tournaments/{tid}/eligible-players",
                     params={"body_code": "DIV-IND"}, timeout=20)
    assert r.status_code == 200, r.text
    data = r.json()
    # Tournament envelope matched to master
    assert data["tournament"]["master_matched"] is True
    assert data["tournament"]["gender"] == "Men"
    assert data["tournament"]["born_on_or_before"] == "2012-09-01"
    assert data["tournament"]["medical_required"] is True
    # Our 3 seeded players should appear (regardless of any others in DB)
    all_ids = {p["id"] for p in data["eligible"]} | {p["id"] for p in data["ineligible"]}
    assert set(pids).issubset(all_ids)
    eligible_ids = {p["id"] for p in data["eligible"]}
    assert pids[0] in eligible_ids
    ineligible_by_id = {p["id"]: p for p in data["ineligible"]}
    assert pids[1] in ineligible_by_id
    assert any("over_age" in r for r in ineligible_by_id[pids[1]]["eligibility_reasons"])
    assert pids[2] in ineligible_by_id
    assert any("medical_missing" in r for r in ineligible_by_id[pids[2]]["eligibility_reasons"])
