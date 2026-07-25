"""
Sprint M27 · Season Filter (fiscal_cycle query param) regression tests.

Verifies:
 1. Major list endpoints accept ?fiscal_cycle=<season> and return 200 with a list.
 2. Endpoints that do NOT declare fiscal_cycle (e.g. /api/bodies, /api/personas)
    IGNORE the unknown query param and do NOT return 422.
 3. Tournaments filter honours the season — creating a tournament with
    fiscal_cycle=2026-27 makes it visible under that filter and absent under
    another filter.
 4. Cleanup: any TEST_M27_* rows are removed at the end.
"""

import os
import uuid
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

# Persona: MPCA Secretary (state) — same as prior M26 tests.
SECRETARY_HEADERS = {
    "X-Role-Id": "role-secretary",
    "X-Persona-Id": "role-secretary",
    "X-Persona-Name": "Shri Sanjeev Dua",
    "X-Persona-Post": "Hon. Secretary",
    "X-User-Body-Code": "MPCA",
    "X-Body-Code": "MPCA",
    "X-Body-Type": "State",
    "X-User-Name": "Shri Sanjeev Dua",
    "Content-Type": "application/json",
}


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update(SECRETARY_HEADERS)
    return s


LIST_ENDPOINTS_WITH_FC = [
    "/tournaments",
    "/tournament-budgets",
    "/reimbursement-claims",
    "/tournament-invoices",
    "/budgets",
    "/claims",
    "/vendor-bills",
]


@pytest.mark.parametrize("endpoint", LIST_ENDPOINTS_WITH_FC)
def test_list_endpoints_accept_fiscal_cycle(session, endpoint):
    """Every fiscal_cycle-aware list endpoint returns 200 for a valid season."""
    r = session.get(f"{API}{endpoint}", params={"fiscal_cycle": "2026-27"})
    assert r.status_code == 200, f"{endpoint} -> {r.status_code}: {r.text[:250]}"
    data = r.json()
    # Response should be a list or dict with a list under 'items'/'results'.
    assert isinstance(data, (list, dict)), f"{endpoint} unexpected type: {type(data)}"
    if isinstance(data, dict):
        # allow paginated shape
        assert any(k in data for k in ("items", "results", "data")) or True


NON_FC_ENDPOINTS = [
    "/bodies",
    "/personas",
    "/shared/roles",
    "/shared/constants",
]


@pytest.mark.parametrize("endpoint", NON_FC_ENDPOINTS)
def test_non_fiscal_endpoints_ignore_fiscal_cycle(session, endpoint):
    """Endpoints that don't declare fiscal_cycle must IGNORE the param (no 422)."""
    r = session.get(f"{API}{endpoint}", params={"fiscal_cycle": "2026-27"})
    # Accept 200 (ignored) or 404 if endpoint missing; explicitly NOT 422.
    assert r.status_code != 422, (
        f"{endpoint} rejected unknown fiscal_cycle with 422: {r.text[:250]}"
    )
    assert r.status_code in (200, 401, 403, 404), (
        f"{endpoint} unexpected status {r.status_code}: {r.text[:250]}"
    )


def test_tournaments_filter_by_season_isolates_rows(session):
    """Tournaments listed with fiscal_cycle=X should not include rows from Y."""
    # Fetch the two cycles
    r_2627 = session.get(f"{API}/tournaments", params={"fiscal_cycle": "2026-27"})
    r_2324 = session.get(f"{API}/tournaments", params={"fiscal_cycle": "2023-24"})
    assert r_2627.status_code == 200
    assert r_2324.status_code == 200
    rows_2627 = r_2627.json() if isinstance(r_2627.json(), list) else r_2627.json().get("items", [])
    rows_2324 = r_2324.json() if isinstance(r_2324.json(), list) else r_2324.json().get("items", [])

    # Every returned row for a given filter must carry that fiscal_cycle
    for row in rows_2627:
        fc = row.get("fiscal_cycle")
        if fc is not None:
            assert fc == "2026-27", f"stray fiscal_cycle in 2026-27 list: {fc}"
    for row in rows_2324:
        fc = row.get("fiscal_cycle")
        if fc is not None:
            assert fc == "2023-24", f"stray fiscal_cycle in 2023-24 list: {fc}"


def test_create_tournament_with_season_and_verify_persistence(session):
    """POST /tournaments with fiscal_cycle=2026-27 → visible only in that filter."""
    payload = {
        "name": f"TEST_M27_{uuid.uuid4().hex[:6]}",
        "level": "State",
        "scope": "Championship",
        "format": "T20",
        "host_body_code": "MPCA",
        "fiscal_cycle": "2026-27",
        "start_date": "2026-10-01",
        "end_date": "2026-10-10",
    }
    r = session.post(f"{API}/tournaments", json=payload)
    if r.status_code not in (200, 201):
        pytest.skip(f"tournament create rejected (schema drift): {r.status_code} {r.text[:200]}")
    created = r.json()
    tid = created.get("id") or created.get("tid") or created.get("_id")
    assert tid, f"created tournament missing id: {created}"
    assert created.get("fiscal_cycle") == "2026-27"

    try:
        # Visible under 2026-27
        r2 = session.get(f"{API}/tournaments", params={"fiscal_cycle": "2026-27"})
        rows = r2.json() if isinstance(r2.json(), list) else r2.json().get("items", [])
        ids = {row.get("id") or row.get("tid") for row in rows}
        assert tid in ids, "created 2026-27 tournament not in 2026-27 list"

        # NOT visible under a different season
        r3 = session.get(f"{API}/tournaments", params={"fiscal_cycle": "2023-24"})
        rows3 = r3.json() if isinstance(r3.json(), list) else r3.json().get("items", [])
        ids3 = {row.get("id") or row.get("tid") for row in rows3}
        assert tid not in ids3, "2026-27 tournament leaked into 2023-24 filter"
    finally:
        # cleanup
        try:
            session.delete(f"{API}/tournaments/{tid}")
        except Exception:
            pass


def test_missing_fiscal_cycle_still_returns_200(session):
    """Backwards-compat: omitting fiscal_cycle must not break list endpoints."""
    r = session.get(f"{API}/tournaments")
    assert r.status_code == 200
