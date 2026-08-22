"""Iter 123x — Public uploads endpoint for anonymous player registration."""
import io
import os
import struct
import zlib
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://nice-aryabhata-4.preview.emergentagent.com").rstrip("/")
REG_TOKEN = "FK4KROD9kjFb5EGB"


def _tiny_png_bytes() -> bytes:
    # 1x1 PNG
    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = b"IHDR" + struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0)
    ihdr_chunk = struct.pack(">I", 13) + ihdr + struct.pack(">I", zlib.crc32(ihdr) & 0xFFFFFFFF)
    raw = b"\x00\xff\x00\x00"
    comp = zlib.compress(raw)
    idat = b"IDAT" + comp
    idat_chunk = struct.pack(">I", len(comp)) + idat + struct.pack(">I", zlib.crc32(idat) & 0xFFFFFFFF)
    iend = b"IEND"
    iend_chunk = struct.pack(">I", 0) + iend + struct.pack(">I", zlib.crc32(iend) & 0xFFFFFFFF)
    return sig + ihdr_chunk + idat_chunk + iend_chunk


PNG = _tiny_png_bytes()


def _files():
    return {"file": ("smoke.png", io.BytesIO(PNG), "image/png")}


class TestPublicUploads:
    def test_happy_path_valid_token(self):
        r = requests.post(
            f"{BASE_URL}/api/public/uploads",
            files=_files(),
            data={"related_type": "player_registration", "registration_token": REG_TOKEN},
            timeout=30,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert "id" in body and isinstance(body["id"], str)
        assert body["url"].startswith("/api/uploads/")
        assert body["mime_type"] == "image/png"
        assert body["related_type"] == "player_registration"
        # meta endpoint is auth-protected — just confirm file-serve path exists (may 401 without auth, that's fine)
        assert body["size_bytes"] > 0

    def test_invalid_token_returns_404(self):
        r = requests.post(
            f"{BASE_URL}/api/public/uploads",
            files=_files(),
            data={"related_type": "player_registration", "registration_token": "NOPE_BADTOKEN_XYZ"},
            timeout=30,
        )
        assert r.status_code == 404, r.text

    def test_wrong_scope_returns_400(self):
        r = requests.post(
            f"{BASE_URL}/api/public/uploads",
            files=_files(),
            data={"related_type": "invoice", "registration_token": REG_TOKEN},
            timeout=30,
        )
        assert r.status_code == 400, r.text

    def test_missing_token_returns_400(self):
        r = requests.post(
            f"{BASE_URL}/api/public/uploads",
            files=_files(),
            data={"related_type": "player_registration"},
            timeout=30,
        )
        assert r.status_code == 400, r.text

    def test_protected_uploads_still_requires_auth(self):
        r = requests.post(
            f"{BASE_URL}/api/uploads",
            files=_files(),
            data={"related_type": "player_registration"},
            timeout=30,
        )
        assert r.status_code == 401, f"expected 401, got {r.status_code}: {r.text}"
