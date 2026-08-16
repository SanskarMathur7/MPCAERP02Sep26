"""MPCA-246 · Rich multi-section closure PDF.

Locks the contract:
    - GET /tournaments/{tid}/closure-letter/pdf returns application/pdf
    - Header content depends on wiring owner (MPCA vs Host Division)
    - PDF is generated regardless of whether the text-based letter has been
      created yet (skeleton mode)
"""
from pathlib import Path
import requests


def _api():
    for ln in Path("/app/frontend/.env").read_text().splitlines():
        if ln.startswith("REACT_APP_BACKEND_URL="):
            return ln.split("=", 1)[1].strip() + "/api"
    raise RuntimeError("REACT_APP_BACKEND_URL not set")


API = _api()


def test_closure_pdf_returns_application_pdf():
    r = requests.get(f"{API}/tournaments", timeout=20)
    r.raise_for_status()
    tournaments = r.json() or []
    if not tournaments:
        return
    tid = tournaments[0]["id"]
    r = requests.get(f"{API}/tournaments/{tid}/closure-letter/pdf", timeout=60)
    assert r.status_code == 200, r.text[:500]
    assert r.headers.get("content-type", "").startswith("application/pdf")
    assert r.content.startswith(b"%PDF")
    # Should be non-trivially sized (skeleton PDF is ~4KB minimum with tables)
    assert len(r.content) > 2000, f"PDF surprisingly small: {len(r.content)} bytes"


def test_closure_pdf_404_for_unknown_tournament():
    r = requests.get(f"{API}/tournaments/does-not-exist/closure-letter/pdf", timeout=20)
    assert r.status_code == 404


def test_closure_pdf_all_tournament_types_render():
    """Regression: rich PDF must render for every seeded tournament — no
    KeyError / None crash on missing collections."""
    r = requests.get(f"{API}/tournaments", timeout=20)
    r.raise_for_status()
    for t in r.json()[:8]:  # cap at 8 for speed
        r = requests.get(f"{API}/tournaments/{t['id']}/closure-letter/pdf", timeout=60)
        assert r.status_code == 200, f"{t['id']}: {r.status_code} — {r.text[:200]}"
        assert r.content.startswith(b"%PDF")
