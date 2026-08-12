"""MPCA Feb-2026 · Auto-deactivation on scheme edit + re-activation gate.

Covers:
  (a) Baseline season-activation POST
  (b) Mid-year PUT on scheme 2-A revises + auto-deactivates the season
  (c) GET season-activation returns is_active=false with deactivation_reason
  (d) POST /tournaments during inactive season → 403
  (e) Re-uploading signed master PDF re-activates
  (f) Retry tournament create → 200 with host/visiting scheme codes
  (g) 2025-26 season-activation is not affected
  (h) Non-MPCA cannot PUT

Cleans up all TEST_* tournaments and restores 2-A conditions.
"""
import os
import pytest
import requests
from datetime import date, timedelta

def _load_backend_url():
    url = os.environ.get("REACT_APP_BACKEND_URL")
    if not url:
        # fallback: read frontend/.env
        try:
            with open("/app/frontend/.env") as f:
                for line in f:
                    if line.startswith("REACT_APP_BACKEND_URL="):
                        url = line.split("=", 1)[1].strip()
                        break
        except Exception:
            pass
    assert url, "REACT_APP_BACKEND_URL not set"
    return url.rstrip("/")

BASE_URL = _load_backend_url()
API = f"{BASE_URL}/api"

MPCA_HEADERS = {
    "X-Body-Type": "State",
    "X-Body-Code": "MPCA",
    "X-Role-Id": "secretary",
    "Content-Type": "application/json",
}
DIV_HEADERS = {
    "X-Body-Type": "Division",
    "X-Body-Code": "DIV-IND",
    "X-Role-Id": "secretary",
    "Content-Type": "application/json",
}

CYCLE = "2026-27"
SCHEME_CODE = "2-A"

_state = {"created_tournaments": [], "orig_conditions": None}


@pytest.fixture(scope="module", autouse=True)
def cleanup_and_restore():
    # Snapshot original 2-A conditions
    r = requests.get(f"{API}/reimbursement-schemes/{SCHEME_CODE}?fiscal_cycle={CYCLE}", headers=MPCA_HEADERS)
    if r.status_code == 200:
        _state["orig_conditions"] = r.json().get("conditions", [])
    yield
    # Restore 2-A conditions if we mutated them
    if _state["orig_conditions"] is not None:
        requests.put(
            f"{API}/reimbursement-schemes/{SCHEME_CODE}?fiscal_cycle={CYCLE}",
            headers=MPCA_HEADERS,
            json={"conditions": _state["orig_conditions"], "revision_note": "restore after test"},
        )
    # Re-activate 2026-27
    requests.post(
        f"{API}/schemes/season-activation",
        headers=MPCA_HEADERS,
        json={"fiscal_cycle": CYCLE, "signed_pdf_url": "/api/uploads/test-restore-final", "signed_by": "Test Cleanup"},
    )
    # Delete test tournaments
    for tid in _state["created_tournaments"]:
        try:
            requests.delete(f"{API}/tournaments/{tid}", headers=MPCA_HEADERS)
        except Exception:
            pass


def _tournament_payload():
    today = date.today()
    return {
        "name": f"TEST_AutoDeact_{today.isoformat()}",
        "tournament_type": "MPCA_InterDivisional",
        "tournament_type_code": "inter_div",
        "scope": "Inter_Divisional",
        "format": "Multi_Day",
        "host_body_id": "DIV-IND",
        "fiscal_cycle": CYCLE,
        "start_date": today.isoformat(),
        "end_date": (today + timedelta(days=3)).isoformat(),
        "category": "Senior_Men",
        "age_group": "Senior",
    }


def test_a_baseline_activation():
    r = requests.post(
        f"{API}/schemes/season-activation",
        headers=MPCA_HEADERS,
        json={"fiscal_cycle": CYCLE, "signed_pdf_url": "/api/uploads/test-baseline", "signed_by": "Test"},
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("is_active") is True
    assert data.get("fiscal_cycle") == CYCLE


def test_b_put_scheme_triggers_revision():
    r = requests.put(
        f"{API}/reimbursement-schemes/{SCHEME_CODE}?fiscal_cycle={CYCLE}",
        headers=MPCA_HEADERS,
        json={"conditions": ["test condition — autodeact"], "revision_note": "trigger autodeact"},
    )
    assert r.status_code == 200, r.text
    data = r.json()
    history = data.get("revision_history", [])
    assert len(history) >= 1
    assert any(h.get("note") == "trigger autodeact" for h in history)


def test_c_season_now_inactive():
    r = requests.get(f"{API}/schemes/season-activation?fiscal_cycle={CYCLE}", headers=MPCA_HEADERS)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("is_active") is False, f"Expected is_active false, got {data}"
    reason = data.get("deactivation_reason", "") or ""
    assert f"Scheme {SCHEME_CODE} revised" in reason, f"Reason: {reason}"
    dbr = data.get("deactivated_by_revision") or {}
    assert dbr.get("scheme_code") == SCHEME_CODE


def test_d_tournament_create_blocked():
    r = requests.post(f"{API}/tournaments", headers=MPCA_HEADERS, json=_tournament_payload())
    assert r.status_code == 403, f"Expected 403, got {r.status_code}: {r.text}"
    assert f"Schemes for {CYCLE}" in r.text or "not yet activated" in r.text.lower(), r.text


def test_e_reupload_reactivates():
    r = requests.post(
        f"{API}/schemes/season-activation",
        headers=MPCA_HEADERS,
        json={"fiscal_cycle": CYCLE, "signed_pdf_url": "/api/uploads/test-reupload-v2", "signed_by": "Test Re-sign"},
    )
    assert r.status_code == 200, r.text
    assert r.json().get("is_active") is True


def test_f_tournament_create_succeeds():
    r = requests.post(f"{API}/tournaments", headers=MPCA_HEADERS, json=_tournament_payload())
    assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
    data = r.json()
    tid = data.get("id")
    assert tid, "no tournament id returned"
    _state["created_tournaments"].append(tid)
    assert data.get("host_scheme_code") == "2-D", f"host_scheme_code={data.get('host_scheme_code')}"
    assert data.get("visiting_scheme_code") == "2-C", f"visiting_scheme_code={data.get('visiting_scheme_code')}"


def test_g_2025_26_unaffected():
    r = requests.get(f"{API}/schemes/season-activation?fiscal_cycle=2025-26", headers=MPCA_HEADERS)
    # Should return either 200 with any state, or 404 — but must not error and must not be tied to 2026-27
    assert r.status_code in (200, 404), r.text
    if r.status_code == 200:
        data = r.json()
        assert data.get("fiscal_cycle") == "2025-26"


def test_h_non_mpca_cannot_edit():
    r = requests.put(
        f"{API}/reimbursement-schemes/{SCHEME_CODE}?fiscal_cycle={CYCLE}",
        headers=DIV_HEADERS,
        json={"conditions": ["should be blocked"], "revision_note": "unauthorized"},
    )
    assert r.status_code == 403, f"Expected 403, got {r.status_code}: {r.text}"
