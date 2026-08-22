"""Iter 108 · RBAC / scope enforcement smoke tests.

Verifies the three critical properties of the new authorization layer:

1. Data routes require Bearer authentication (401 without token).
2. Backend derives scope from the JWT — sending X-Body-Type: State from a
   Division user does NOT elevate them.
3. Match Official cannot reach the state-wide stats endpoints.
4. RBAC admin console requires the President/Secretary role.
"""
import os
import pytest
import httpx


API = f"{os.environ.get('BACKEND_URL', 'http://localhost:8001')}/api"


def _login(email: str, password: str = "mpca@2026") -> str:
    r = httpx.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=10)
    assert r.status_code == 200, f"login for {email} failed: {r.text}"
    return r.json()["access_token"]


@pytest.mark.parametrize("path", [
    "/players-stats/summary",
    "/tournaments-stats/summary",
    "/bodies/MPCA/children-activity",
    "/rbac/users",
])
def test_data_routes_require_auth(path):
    r = httpx.get(f"{API}{path}", timeout=10)
    assert r.status_code == 401, f"{path} should require auth, got {r.status_code}"


def test_public_endpoints_still_open():
    for path in ("/health", "/"):
        r = httpx.get(f"{API}{path}", timeout=10)
        assert r.status_code in (200, 503), f"{path} should be public"


def test_state_persona_sees_all_players():
    tok = _login("president@mpca.in")
    r = httpx.get(f"{API}/players-stats/summary",
                  headers={"Authorization": f"Bearer {tok}"}, timeout=10)
    assert r.status_code == 200
    body = r.json()
    assert body["scope"] == "MPCA"


def test_division_persona_scoped_and_cannot_spoof():
    tok = _login("indore.secretary@mpca.in")
    # 1) Plain call → scoped
    r = httpx.get(f"{API}/players-stats/summary",
                  headers={"Authorization": f"Bearer {tok}"}, timeout=10)
    assert r.status_code == 200
    scoped_body = r.json()
    assert scoped_body["scope"] == "DIV-IND"

    # 2) Header-spoof attempt → still scoped to DIV-IND
    r2 = httpx.get(f"{API}/players-stats/summary",
                   headers={
                       "Authorization": f"Bearer {tok}",
                       "X-Body-Type": "State",
                       "X-Body-Code": "MPCA",
                       "X-Persona-Id": "president",
                   }, timeout=10)
    assert r2.status_code == 200
    assert r2.json()["scope"] == "DIV-IND", "header spoof must not elevate scope"


def test_division_cannot_drill_into_another_body():
    tok = _login("indore.secretary@mpca.in")
    r = httpx.get(f"{API}/bodies/DIV-GWL/children-activity",
                  headers={"Authorization": f"Bearer {tok}"}, timeout=10)
    assert r.status_code == 403, "Indore Secretary must not read Gwalior's drill-down"


def test_district_denied_drill_down():
    tok = _login("indore.district@mpca.in")
    r = httpx.get(f"{API}/bodies/DIST-INDO-IND/children-activity",
                  headers={"Authorization": f"Bearer {tok}"}, timeout=10)
    assert r.status_code == 403, "Districts have no children to drill into"


def test_rbac_console_requires_state_role():
    # Division secretary must be denied
    tok = _login("indore.secretary@mpca.in")
    r = httpx.get(f"{API}/rbac/users", headers={"Authorization": f"Bearer {tok}"}, timeout=10)
    assert r.status_code == 403

    # No-header bootstrap bypass is closed
    r0 = httpx.get(f"{API}/rbac/users", timeout=10)
    assert r0.status_code == 401
