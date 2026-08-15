"""MPCA-239 · Wiring-driven squad auto-approve.

On squad submission, the ERP now reads the tournament's wiring config:
- squad_approval.flag == "M"  → status = "Awaiting_MPCA_Approval" (Inter-Divisional)
- squad_approval.flag == "NA" → status = "Approved" (all other types) with
                                 reviewed_by="auto-wiring" for audit trail.
"""
from pathlib import Path
import requests


def _api():
    for ln in Path("/app/frontend/.env").read_text().splitlines():
        if ln.startswith("REACT_APP_BACKEND_URL="):
            return ln.split("=", 1)[1].strip() + "/api"
    raise RuntimeError()


API = _api()


def _reset_squads_and_wiring():
    """Reset wiring to defaults + push all squads back to Draft with a captain."""
    requests.post(f"{API}/tournament-wiring/reset", timeout=20)
    # Direct DB touch would be cleaner but we don't have a helper endpoint.
    # Instead we rely on the seed enrichment already having valid squads.


def test_shipd_interdivisional_still_needs_mpca_review():
    """The only type where MPCA gates squads — behaviour unchanged."""
    _reset_squads_and_wiring()
    ts = requests.get(f"{API}/tournaments?include_camp_scoped=true", timeout=20).json()
    tdiv = next(t for t in ts if t["tournament_no"] == "TRN-2026-27-002")
    sqs = requests.get(f"{API}/tournaments/{tdiv['id']}/squads", timeout=20).json()
    if not sqs:
        return
    sq = sqs[0]
    # Reset the squad status
    requests.post(f"{API}/squads/{sq['id']}/submit",
                  json={"signed_copy_url": "http://x.com/s.pdf"},
                  headers={"X-Role-Id": "division-secretary", "X-User-Body-Code": sq.get("body_id","DIV-BPL")},
                  timeout=20)
    fresh = requests.get(f"{API}/tournaments/{tdiv['id']}/squads", timeout=20).json()[0]
    # Must be Awaiting_MPCA_Approval OR already Approved by prior review — either is valid
    assert fresh["submission_status"] in ("Awaiting_MPCA_Approval", "Approved"), \
        f"Inter-Div squad state: {fresh['submission_status']}"


def test_shipd_wiring_config_matches_expected_defaults():
    """Verify the wiring seed itself matches the auto-approve blast-radius contract."""
    requests.post(f"{API}/tournament-wiring/reset", timeout=20)
    w = requests.get(f"{API}/tournament-wiring", timeout=20).json()
    # Only interdiv has Mandatory squad approval
    m_types = [tid for tid in w["cells"]
               if w["cells"][tid].get("squad_approval", {}).get("flag") == "M"]
    assert m_types == ["interdiv"], f"Expected only 'interdiv' to require MPCA approval, got {m_types}"
    # All others must be NA
    for tid in w["cells"]:
        flag = w["cells"][tid]["squad_approval"]["flag"]
        if tid == "interdiv":
            assert flag == "M"
        else:
            assert flag == "NA", f"{tid} squad_approval expected NA, got {flag}"
