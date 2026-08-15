"""MPCA-235 · Ship 2 · Regression tests for the tournament wiring-status endpoint."""
from pathlib import Path

import requests


def _api():
    for ln in Path("/app/frontend/.env").read_text().splitlines():
        if ln.startswith("REACT_APP_BACKEND_URL="):
            return ln.split("=", 1)[1].strip() + "/api"
    raise RuntimeError("REACT_APP_BACKEND_URL not set")


API = _api()


def _first_tid():
    r = requests.get(f"{API}/tournaments", timeout=20)
    r.raise_for_status()
    docs = r.json()
    if not docs:
        return None
    return docs[0]["id"]


def test_wiring_status_shape():
    tid = _first_tid()
    if not tid:
        return  # no tournaments to test against
    r = requests.get(f"{API}/tournaments/{tid}/wiring-status", timeout=20)
    assert r.status_code == 200
    d = r.json()
    assert d["tournament_id"] == tid
    assert d["type_id"] in {"bcci", "interdiv", "camp", "district",
                             "interschool", "interclub", "coachingcamp", "vacationcamp"}
    assert d["type_name"]
    assert 0 <= d["progress_pct"] <= 100
    assert len(d["steps"]) == 9
    valid_statuses = {"done", "current", "pending", "na", "info"}
    for s in d["steps"]:
        assert s["key"]
        assert s["label"]
        assert s["status"] in valid_statuses
        assert s["anchor"]
        assert "flag" in s
        assert "bucket" in s


def test_wiring_status_creation_is_done():
    tid = _first_tid()
    if not tid:
        return
    d = requests.get(f"{API}/tournaments/{tid}/wiring-status", timeout=20).json()
    # Tournament Creation must always be 'done' — the tournament exists
    creation = next(s for s in d["steps"] if s["key"] == "tournament_creation")
    assert creation["status"] == "done"


def test_wiring_status_current_marker_present_or_all_done():
    tid = _first_tid()
    if not tid:
        return
    d = requests.get(f"{API}/tournaments/{tid}/wiring-status", timeout=20).json()
    # Either at least one 'current' exists OR all Mandatory steps are done
    m_steps = [s for s in d["steps"] if s["flag"] == "M"]
    current = [s for s in d["steps"] if s["status"] == "current"]
    all_m_done = all(s["status"] == "done" for s in m_steps)
    assert len(current) >= 1 or all_m_done


def test_wiring_status_unknown_tournament_404():
    r = requests.get(f"{API}/tournaments/not-a-real-id/wiring-status", timeout=20)
    assert r.status_code == 404
