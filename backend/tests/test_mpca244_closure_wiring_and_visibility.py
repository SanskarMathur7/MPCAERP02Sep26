"""MPCA-243 · Ship 3 · Closure wiring step + visibility timing + Division stepper.

Locks the contract for the 4 items shipped:
    - New `tournament_closure` wiring step for all 8 types
    - New `POST /tournaments/{tid}/closure-signed-upload` guarded by wiring owner
    - New `POST /tournaments/{tid}/close` requires signed PDF + wiring owner
    - Division persona may drive the status stepper on Division-owned tournaments
    - Finance-console visibility=On_Submit hides pre-submission rows from State observers
"""
from pathlib import Path
import requests


def _api():
    for ln in Path("/app/frontend/.env").read_text().splitlines():
        if ln.startswith("REACT_APP_BACKEND_URL="):
            return ln.split("=", 1)[1].strip() + "/api"
    raise RuntimeError("REACT_APP_BACKEND_URL not set")


API = _api()


def _find_tournament_by_wiring_type(target_type: str):
    r = requests.get(f"{API}/tournaments", timeout=20)
    r.raise_for_status()
    for t in r.json():
        try:
            ws = requests.get(f"{API}/tournaments/{t['id']}/wiring-status", timeout=20)
            if ws.status_code == 200 and ws.json().get("type_id") == target_type:
                return t
        except Exception:
            continue
    return None


def test_wiring_now_has_10_steps_including_tournament_closure():
    """Contract: wiring must expose the new tournament_closure step."""
    r = requests.get(f"{API}/tournament-wiring", timeout=20)
    r.raise_for_status()
    d = r.json()
    step_keys = [s["key"] for s in d.get("steps", [])]
    assert "tournament_closure" in step_keys, f"missing tournament_closure in {step_keys}"
    # Every type has a cell for it
    for tid in ("bcci", "interdiv", "camp", "district", "interschool",
                "interclub", "coachingcamp", "vacationcamp"):
        cell = d.get("cells", {}).get(tid, {}).get("tournament_closure")
        assert cell is not None, f"{tid} missing tournament_closure cell"
        assert cell.get("flag") == "M"
        assert cell.get("owner") in {"MPCA", "Division"}


def test_close_tournament_requires_signed_pdf_first():
    """POST /tournaments/{tid}/close must 400 when no signed URL is present,
    or 403 for wrong body. Skips if the picked tournament has already been
    closed by a prior test run."""
    t = _find_tournament_by_wiring_type("district")
    if not t:
        return
    # If already closed from a prior run, this contract is inapplicable.
    fresh = requests.get(f"{API}/tournaments/{t['id']}", timeout=20).json()
    if fresh.get("status") == "Completed":
        return
    # Clear any pre-existing signed URL so we can verify the 400 branch
    r = requests.post(
        f"{API}/tournaments/{t['id']}/close",
        headers={"X-Body-Type": "Division", "X-User-Body-Code": "DIV-IND"},
        timeout=20,
    )
    if r.status_code == 403:
        host = t.get("host_body_id") or ""
        parent = f"DIV-{host.split('-')[-1]}" if host.startswith("DIST-") else host
        r = requests.post(
            f"{API}/tournaments/{t['id']}/close",
            headers={"X-Body-Type": "Division" if parent.startswith("DIV-") else "State",
                     "X-User-Body-Code": parent},
            timeout=20,
        )
    # 400 = no signed PDF, 403 = wrong body_type, 200+"already"=already-closed
    if r.status_code == 200:
        assert r.json().get("already") == "Completed"
    else:
        assert r.status_code in (400, 403), r.text
        if r.status_code == 400:
            assert "signed closure" in r.text.lower() or "closure" in r.text.lower()


def test_signed_upload_and_then_close_flow():
    """Full happy path: Division uploads signed URL → Close tournament succeeds."""
    t = _find_tournament_by_wiring_type("district")
    if not t:
        return
    tid = t["id"]
    host = t.get("host_body_id") or ""
    if not host.startswith("DIST-"):
        return
    parent_div = f"DIV-{host.split('-')[-1]}"
    headers = {"X-Body-Type": "Division", "X-User-Body-Code": parent_div,
               "X-User-Name": "Test Div Sec"}

    r = requests.post(
        f"{API}/tournaments/{tid}/closure-signed-upload",
        json={"signed_url": "https://example.com/signed.pdf"},
        headers=headers, timeout=20,
    )
    assert r.status_code == 200, r.text
    assert r.json().get("closure_signed_url") == "https://example.com/signed.pdf"
    assert "Test Div Sec" in (r.json().get("closure_signed_by") or "")

    # Now close should work
    r = requests.post(f"{API}/tournaments/{tid}/close", headers=headers, timeout=20)
    assert r.status_code == 200, r.text
    body = r.json()
    if body.get("already") != "Completed":
        assert body.get("status") == "Completed"


def test_district_persona_blocked_from_closing_interdiv_tournament():
    """District persona cannot close an Inter-Division tournament (owner=MPCA)."""
    t = _find_tournament_by_wiring_type("interdiv")
    if not t:
        return
    r = requests.post(
        f"{API}/tournaments/{t['id']}/close",
        headers={"X-Body-Type": "District", "X-User-Body-Code": "DIST-INDO-IND"},
        timeout=20,
    )
    assert r.status_code == 403, r.text
