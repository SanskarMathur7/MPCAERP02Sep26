"""MPCA-238 · Wiring-driven match-official assignment guard.

Backend guard: for tournament types whose wiring says
`match_official_posting.owner == 'Division'`, Division personas can
POST /tournaments/{tid}/match-officials. For MPCA-owned types, only
State-scope personas can assign (unchanged behaviour)."""
from pathlib import Path
import requests


def _api():
    for ln in Path("/app/frontend/.env").read_text().splitlines():
        if ln.startswith("REACT_APP_BACKEND_URL="):
            return ln.split("=", 1)[1].strip() + "/api"
    raise RuntimeError("REACT_APP_BACKEND_URL not set")


API = _api()


def _first(tno):
    ts = requests.get(f"{API}/tournaments?include_camp_scoped=true", timeout=20).json()
    return next((t for t in ts if t["tournament_no"] == tno), None)


def _one_official():
    r = requests.get(f"{API}/match-officials?active_only=true", timeout=20).json()
    return r[0]["id"] if r else None


def test_division_can_assign_on_interdistrict():
    t = _first("TRN-2026-27-003")
    oid = _one_official()
    assert t and oid
    r = requests.post(f"{API}/tournaments/{t['id']}/match-officials",
                      json={"official_id": oid, "role": "Umpire", "days": 1},
                      headers={"X-Body-Type": "Division", "X-Role-Id": "division-secretary"},
                      timeout=20)
    assert r.status_code == 200, f"Division blocked wrongly: {r.text}"


def test_division_still_blocked_on_interdivisional():
    t = _first("TRN-2026-27-002")
    oid = _one_official()
    assert t and oid
    r = requests.post(f"{API}/tournaments/{t['id']}/match-officials",
                      json={"official_id": oid, "role": "Umpire", "days": 1},
                      headers={"X-Body-Type": "Division", "X-Role-Id": "division-secretary"},
                      timeout=20)
    assert r.status_code == 403, "Division should be blocked on MPCA-owned type"


def test_state_still_works_everywhere():
    """MPCA state persona must still be able to assign on any type."""
    for tno in ("TRN-2026-27-001", "TRN-2026-27-002", "TRN-2026-27-003"):
        t = _first(tno)
        oid = _one_official()
        r = requests.post(f"{API}/tournaments/{t['id']}/match-officials",
                          json={"official_id": oid, "role": "Umpire", "days": 1},
                          headers={"X-Body-Type": "State", "X-Role-Id": "secretary"},
                          timeout=20)
        assert r.status_code == 200, f"State regression on {tno}: {r.status_code} {r.text[:200]}"


def test_district_persona_blocked_on_interdivisional():
    """District can't assign on Inter-Divisional (owner=MPCA)."""
    t = _first("TRN-2026-27-002")
    oid = _one_official()
    r = requests.post(f"{API}/tournaments/{t['id']}/match-officials",
                      json={"official_id": oid, "role": "Umpire", "days": 1},
                      headers={"X-Body-Type": "District", "X-Role-Id": "district-secretary"},
                      timeout=20)
    assert r.status_code == 403
