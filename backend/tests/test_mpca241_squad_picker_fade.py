"""MPCA-241 · Regression: wiring-status must expose the squad `mode` so the
frontend can fade the register-picker for Manual_PDF tournament types.

Frontend UI conditional lives in `SquadDetail.jsx` and reads
`wiringSquadMode.mode` from `/tournaments/{tid}/wiring-status`. This test
locks the contract for the 8 tournament types: only `interdiv` and `camp`
should be `Register_Linked`; the rest must be `Manual_PDF`.
"""
from pathlib import Path

import requests


def _api():
    for ln in Path("/app/frontend/.env").read_text().splitlines():
        if ln.startswith("REACT_APP_BACKEND_URL="):
            return ln.split("=", 1)[1].strip() + "/api"
    raise RuntimeError("REACT_APP_BACKEND_URL not set")


API = _api()

# type_id -> expected squad mode. This IS the contract MPCA-241 depends on.
EXPECTED_MODE = {
    "bcci":         "Manual_PDF",
    "interdiv":     "Register_Linked",
    "camp":         "Register_Linked",
    "district":     "Manual_PDF",
    "interschool":  "Manual_PDF",
    "interclub":    "Manual_PDF",
    "coachingcamp": "Manual_PDF",
    "vacationcamp": "Manual_PDF",
}


def test_wiring_matrix_exposes_squad_mode_for_all_8_types():
    """The wiring matrix endpoint must expose a `mode` for the squad step of
    every tournament type. The frontend picker-fade logic reads this."""
    r = requests.get(f"{API}/tournament-wiring", timeout=20)
    assert r.status_code == 200
    matrix = r.json()
    # Payload shape: { types: [...], cells: { type_id: { step_key: cell } } }
    cells = matrix.get("cells") or {}
    assert cells, "wiring matrix returned no cells"

    for tid, expected in EXPECTED_MODE.items():
        assert tid in cells, f"missing wiring cells for {tid}"
        squad_cell = cells[tid].get("squad")
        assert squad_cell is not None, f"{tid} has no squad step"
        assert squad_cell["mode"] == expected, (
            f"{tid} squad mode is {squad_cell['mode']!r}, expected {expected!r}"
        )


def test_wiring_status_exposes_squad_mode_on_live_tournament():
    """Pick one tournament (if any exist) and check the per-tournament
    wiring-status response also carries the squad step's `mode`. The
    frontend's `SquadDetail.jsx` reads this exact field."""
    r = requests.get(f"{API}/tournaments", timeout=20)
    r.raise_for_status()
    docs = r.json()
    if not docs:
        return  # no seeded tournaments — nothing to assert

    tid = docs[0]["id"]
    r = requests.get(f"{API}/tournaments/{tid}/wiring-status", timeout=20)
    assert r.status_code == 200
    d = r.json()
    squad = next((s for s in d["steps"] if s["key"] == "squad"), None)
    assert squad is not None, "wiring-status is missing the squad step"
    assert "mode" in squad, "squad step must expose `mode` for the fade UI"
    assert squad["mode"] in {"Register_Linked", "Manual_PDF", "Auto_Compute", "NA"}
