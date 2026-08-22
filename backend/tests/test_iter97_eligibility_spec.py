"""Iter 97 · Feb 2026 · Tournament Eligibility-Spec endpoint + tightened
/players/{pid}/eligible-tournaments (undecidable bucket, Senior-open rule).

Tests:
  BACKEND #1  GET /api/tournaments/{tid}/eligibility-spec
  BACKEND #2  GET /api/players/{pid}/eligible-tournaments (undecidable bucket)
"""
import asyncio
import os
import sys
import uuid
from pathlib import Path

import pytest
import requests

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def _api_url():
    env = Path("/app/frontend/.env").read_text()
    for ln in env.splitlines():
        if ln.startswith("REACT_APP_BACKEND_URL="):
            return ln.split("=", 1)[1].strip() + "/api"
    raise RuntimeError("REACT_APP_BACKEND_URL not set")


API = _api_url()


@pytest.fixture(scope="module")
def seeded():
    """Seed a matching InterDiv tournament, a mismatched tournament and 1 U15 player."""
    from motor.motor_asyncio import AsyncIOMotorClient
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parents[1] / ".env")

    async def _seed():
        c = AsyncIOMotorClient(os.environ["MONGO_URL"])
        db = c[os.environ["DB_NAME"]]
        tid_match = str(uuid.uuid4())
        tid_nomatch = str(uuid.uuid4())
        pid = str(uuid.uuid4())
        await db.tournaments.insert_one({
            "id": tid_match,
            "name": "MM Jagdale Trophy",
            "scope": "Inter_Divisional",
            "tournament_type": "MPCA_InterDivisional",
            "status": "Upcoming",
        })
        await db.tournaments.insert_one({
            "id": tid_nomatch,
            "name": "TEST_ZZZ_NoMatchTrophy_" + tid_nomatch[:8],
            "scope": "Inter_Divisional",
            "tournament_type": "MPCA_InterDivisional",
            "status": "Upcoming",
        })
        await db.players.insert_one({
            "id": pid,
            "player_id": "TEST_ITER97/U15",
            "full_name": "TEST Iter97 U15 Boy",
            "body_id": "DIV-IND",
            "gender": "Male",
            "dob": "2011-05-14",
            "status": "Active",
        })
        c.close()
        return tid_match, tid_nomatch, pid

    async def _cleanup(tid_match, tid_nomatch, pid):
        c = AsyncIOMotorClient(os.environ["MONGO_URL"])
        db = c[os.environ["DB_NAME"]]
        await db.tournaments.delete_one({"id": tid_match})
        await db.tournaments.delete_one({"id": tid_nomatch})
        await db.players.delete_one({"id": pid})
        c.close()

    loop = asyncio.new_event_loop()
    ids = loop.run_until_complete(_seed())
    yield ids
    loop.run_until_complete(_cleanup(*ids))
    loop.close()


# ────────── BACKEND #1 · /eligibility-spec ──────────

def test_eligibility_spec_master_matched(seeded):
    tid_match, _, _ = seeded
    r = requests.get(f"{API}/tournaments/{tid_match}/eligibility-spec", timeout=15)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["tournament_id"] == tid_match
    assert d["master_matched"] is True, d
    assert d["gender"] == "Men"
    assert d["age_grp"] == "U15"
    assert d["born_on_or_before"] == "2012-09-01"
    assert d["medical_required"] is True


def test_eligibility_spec_master_unmatched(seeded):
    _, tid_nomatch, _ = seeded
    r = requests.get(f"{API}/tournaments/{tid_nomatch}/eligibility-spec", timeout=15)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["master_matched"] is False
    assert d["master_id"] is None
    assert d["gender"] is None
    assert d["born_on_or_before"] is None


def test_eligibility_spec_404():
    r = requests.get(f"{API}/tournaments/does-not-exist-id/eligibility-spec", timeout=15)
    assert r.status_code == 404


# ────────── BACKEND #2 · /players/{pid}/eligible-tournaments ──────────

def test_eligible_tournaments_envelope_and_buckets(seeded):
    _, _, pid = seeded
    r = requests.get(f"{API}/players/{pid}/eligible-tournaments", timeout=20)
    assert r.status_code == 200, r.text
    d = r.json()

    # Envelope keys
    for k in ("player_id", "player_name", "player_dob", "player_gender",
              "eligible_count", "tournaments", "undecidable_count",
              "undecidable_tournaments"):
        assert k in d, f"missing key {k}"
    assert d["player_id"] == pid
    assert d["player_dob"] == "2011-05-14"
    assert d["player_gender"] == "Men"

    # (a) eligible_count is small (~10-14)
    ec = d["eligible_count"]
    assert 4 <= ec <= 20, f"eligible_count={ec} outside sanity band 4..20"

    # (b) Includes MM Jagdale + Bhau Nivsarkar
    names = {t.get("name") for t in d["tournaments"]}
    assert "MM Jagdale Trophy" in names, f"MM Jagdale not in eligible: {names}"
    assert "Bhau Nivsarkar Trophy" in names, f"Bhau Nivsarkar not in eligible: {names}"

    # (c) BCCI Ranji Trophy excluded from eligible (goes to undecidable)
    ranji_in_elig = any("Ranji" in (n or "") for n in names)
    assert not ranji_in_elig, f"Ranji Trophy leaked into eligible: {names}"
    und_names = {t.get("name") for t in d["undecidable_tournaments"]}
    assert any("Ranji" in (n or "") for n in und_names), \
        f"Ranji Trophy not in undecidable: {und_names}"

    # (d) undecidable_count > 30
    assert d["undecidable_count"] > 30, f"undecidable_count={d['undecidable_count']} not > 30"


def test_eligible_tournaments_404():
    r = requests.get(f"{API}/players/nonexistent-pid/eligible-tournaments", timeout=15)
    assert r.status_code == 404
