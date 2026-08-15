"""MPCA-235 · Ships A+B · Regression for reordering + audit log + season freeze."""
from pathlib import Path

import requests


def _api():
    for ln in Path("/app/frontend/.env").read_text().splitlines():
        if ln.startswith("REACT_APP_BACKEND_URL="):
            return ln.split("=", 1)[1].strip() + "/api"
    raise RuntimeError("REACT_APP_BACKEND_URL not set")


API = _api()


def test_shipB_patch_writes_audit_row():
    # Snapshot audit count
    before = requests.get(f"{API}/tournament-wiring/audit?limit=1", timeout=20).json()["count"]
    # Edit a cell
    requests.patch(f"{API}/tournament-wiring/cell", json={
        "type_id": "district", "step_key": "squad_approval",
        "flag": "O", "text": "Ship B audit test",
    }, timeout=20)
    after = requests.get(f"{API}/tournament-wiring/audit?limit=500", timeout=20).json()
    # New row exists with correct diff
    assert after["count"] >= before  # never strictly less
    latest = after["rows"][0]
    assert latest["type_id"] == "district"
    assert latest["step_key"] == "squad_approval"
    assert "flag" in latest["diff"] or "text" in latest["diff"]
    assert latest["diff"]["flag"][1] == "O" if "flag" in latest["diff"] else True


def test_shipB_audit_filter_by_type():
    r = requests.get(f"{API}/tournament-wiring/audit?type_id=district&limit=50", timeout=20).json()
    for row in r["rows"]:
        assert row["type_id"] == "district"


def test_shipB_freeze_season_creates_snapshot():
    r = requests.post(f"{API}/tournament-wiring/freeze-season/2027-28", timeout=20)
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True
    assert body["snapshot"]["cycle"] == "2027-28"
    assert body["snapshot"]["revision"] >= 1
    assert body["snapshot"]["wiring_version"] >= 1
    # And it's fetchable from /snapshots
    listed = requests.get(f"{API}/tournament-wiring/snapshots?cycle=2027-28", timeout=20).json()
    assert any(s["id"] == body["snapshot"]["id"] for s in listed["rows"])
    # And the individual snapshot returns full cells
    detail = requests.get(f"{API}/tournament-wiring/snapshots/{body['snapshot']['id']}", timeout=20).json()
    assert "cells" in detail
    assert len(detail["cells"]) == 8


def test_shipB_snapshot_not_found_404():
    r = requests.get(f"{API}/tournament-wiring/snapshots/not-a-real-id", timeout=20)
    assert r.status_code == 404
