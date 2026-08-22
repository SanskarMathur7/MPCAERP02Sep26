"""Iter 123z regression: /api/uploads/{id} must be JWT-gated (401 without bearer,
200 with valid token for an existing upload). DocumentPreview fetch relies on that."""
import os, io, pytest, requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://nice-aryabhata-4.preview.emergentagent.com").rstrip("/")


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": "sysadmin@mpca.in", "password": "mpca@2026"}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def test_uploads_requires_auth():
    # No bearer → 401
    r = requests.get(f"{BASE_URL}/api/uploads/nonexistent-file", timeout=15)
    assert r.status_code in (401, 403), f"Expected 401/403, got {r.status_code}"


def test_uploads_unknown_id_authed(token):
    # Bearer present but bogus id → 404 (route reached, not 401)
    r = requests.get(f"{BASE_URL}/api/uploads/does-not-exist-xyz",
                     headers={"Authorization": f"Bearer {token}"}, timeout=15)
    assert r.status_code == 404, f"Expected 404 after auth, got {r.status_code}: {r.text[:200]}"


def test_upload_then_fetch_roundtrip(token):
    """Upload a small PNG then GET it back with the bearer to prove the flow works."""
    # Minimal 1x1 PNG
    png = bytes.fromhex(
        "89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C489"
        "0000000A49444154789C6300010000000500010D0A2DB40000000049454E44AE426082"
    )
    files = {"file": ("t.png", io.BytesIO(png), "image/png")}
    h = {"Authorization": f"Bearer {token}"}
    up = requests.post(f"{BASE_URL}/api/uploads", files=files, headers=h, timeout=30)
    if up.status_code == 404:
        pytest.skip("No /api/uploads POST endpoint on this env")
    assert up.status_code in (200, 201), up.text
    data = up.json()
    file_url = data.get("url") or data.get("file_url") or data.get("path")
    file_id = data.get("id") or data.get("file_id")
    # Build fetch URL
    if file_url and file_url.startswith("/api/"):
        fetch = BASE_URL + file_url
    elif file_id:
        fetch = f"{BASE_URL}/api/uploads/{file_id}"
    else:
        pytest.skip(f"Could not derive fetch URL from {data}")
    # Without token → 401
    r_noauth = requests.get(fetch, timeout=15)
    assert r_noauth.status_code in (401, 403), f"Expected 401/403 without token, got {r_noauth.status_code}"
    # With token → 200 + bytes match
    r_auth = requests.get(fetch, headers=h, timeout=15)
    assert r_auth.status_code == 200, r_auth.text[:200]
    assert r_auth.content == png, "Downloaded bytes don't match uploaded bytes"
    assert "image" in r_auth.headers.get("content-type", "").lower()
