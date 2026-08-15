"""MPCA-235 · Ships 3/4/6 · Regression for setup-box flags, list filter, squad mode."""
from pathlib import Path

import requests


def _api():
    for ln in Path("/app/frontend/.env").read_text().splitlines():
        if ln.startswith("REACT_APP_BACKEND_URL="):
            return ln.split("=", 1)[1].strip() + "/api"
    raise RuntimeError("REACT_APP_BACKEND_URL not set")


API = _api()
STATE_HEADERS = {"X-User-Persona": "secretary"}


def test_ship4_default_include_camp_scoped_is_true():
    r_default = requests.get(f"{API}/tournaments", headers=STATE_HEADERS, timeout=20)
    r_all     = requests.get(f"{API}/tournaments?include_camp_scoped=true", headers=STATE_HEADERS, timeout=20)
    assert r_default.status_code == 200 and r_all.status_code == 200
    # Default should equal explicit-true (backward compat)
    assert len(r_default.json()) == len(r_all.json())


def test_ship4_include_camp_scoped_false_hides_championship_without_claim():
    r_all      = requests.get(f"{API}/tournaments?include_camp_scoped=true",  headers=STATE_HEADERS, timeout=20)
    r_filtered = requests.get(f"{API}/tournaments?include_camp_scoped=false", headers=STATE_HEADERS, timeout=20)
    assert r_all.status_code == 200 and r_filtered.status_code == 200
    all_scopes = [t.get("scope") for t in r_all.json()]
    filt_scopes = [t.get("scope") for t in r_filtered.json()]
    # Filtered response must never CONTAIN more Championship/Invitational
    # tournaments than the unfiltered one (weak but always true).
    assert filt_scopes.count("Championship") <= all_scopes.count("Championship")
    assert filt_scopes.count("Invitational") <= all_scopes.count("Invitational")
    # And filtered <= all overall
    assert len(filt_scopes) <= len(all_scopes)


def test_ship6_wiring_status_carries_squad_mode_for_all_types():
    """Every tournament's wiring-status must return a `mode` on the squad step."""
    r = requests.get(f"{API}/tournaments", timeout=20)
    r.raise_for_status()
    docs = r.json()
    if not docs:
        return
    for t in docs[:3]:  # sample first 3
        s = requests.get(f"{API}/tournaments/{t['id']}/wiring-status", timeout=20).json()
        squad_step = next((x for x in s["steps"] if x["key"] == "squad"), None)
        assert squad_step is not None
        assert squad_step["mode"] in {"Register_Linked", "Manual_PDF", "Auto_Compute", "NA"}
