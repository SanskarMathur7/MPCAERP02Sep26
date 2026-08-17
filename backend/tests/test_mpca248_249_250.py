"""MPCA-248/249/250 · Ship-3 budgets + PDF merge + grant extras."""
from pathlib import Path
import requests


def _api():
    for ln in Path("/app/frontend/.env").read_text().splitlines():
        if ln.startswith("REACT_APP_BACKEND_URL="):
            return ln.split("=", 1)[1].strip() + "/api"
    raise RuntimeError("REACT_APP_BACKEND_URL not set")


API = _api()


# ─────── MPCA-250 · Grant purpose + extra documents ───────

def _first_draft_claim() -> dict:
    r = requests.get(f"{API}/grant-claims", timeout=20)
    for c in r.json() or []:
        if c["status"] in ("Draft", "Documents_Pending"):
            return c
    return {}


def test_purpose_patch_persists():
    claim = _first_draft_claim()
    if not claim:
        return
    r = requests.patch(f"{API}/grant-claims/{claim['id']}/purpose",
                       json={"purpose_of_claim": "MPCA-250 test purpose · line1\nline2"},
                       timeout=20)
    assert r.status_code == 200, r.text
    assert r.json()["purpose_of_claim"].startswith("MPCA-250 test purpose")


def test_extra_document_add_and_remove_and_appears_in_pdf():
    claim = _first_draft_claim()
    if not claim:
        return
    cid = claim["id"]
    # Add
    r = requests.post(f"{API}/grant-claims/{cid}/extra-document",
                      json={"description": "Photocopy of scheme guideline receipt",
                            "file_url": "https://example.com/doc.pdf",
                            "filename": "receipt.pdf"},
                      timeout=20)
    assert r.status_code == 200, r.text
    added = r.json()["extra_documents"]
    assert any(e["description"] == "Photocopy of scheme guideline receipt" for e in added)
    doc_id = next(e["doc_id"] for e in added if e["description"] == "Photocopy of scheme guideline receipt")

    # Summary PDF should contain the description text or filename
    r = requests.get(f"{API}/grant-claims/{cid}/summary-pdf", timeout=30)
    assert r.status_code == 200
    assert r.content.startswith(b"%PDF")
    # Extract text via pypdf (streams are compressed so literal byte-match fails)
    import io as _io
    from pypdf import PdfReader
    text = "\n".join(p.extract_text() for p in PdfReader(_io.BytesIO(r.content)).pages)
    assert "Supporting Documents" in text and "Photocopy" in text, f"Not found in PDF text: {text[:500]}"

    # Remove
    r = requests.delete(f"{API}/grant-claims/{cid}/extra-document/{doc_id}", timeout=20)
    assert r.status_code == 200
    assert all(e["doc_id"] != doc_id for e in r.json()["extra_documents"])


# ─────── MPCA-248 · Unified budget On_Submit filter ───────

def test_budget_list_endpoint_accepts_state_headers_without_crash():
    """Regression: adding X-Body-Type filter shouldn't break the base list."""
    r = requests.get(f"{API}/tournament-budgets", params={"fiscal_cycle": "2026-27"},
                     headers={"X-Body-Type": "State"}, timeout=20)
    assert r.status_code == 200


# ─────── MPCA-249 · Closure PDF merge ───────

def test_closure_pdf_still_valid_pdf():
    """After adding pypdf merge fallback the base closure PDF must still render."""
    r = requests.get(f"{API}/tournaments", timeout=20)
    for t in r.json()[:1]:
        r = requests.get(f"{API}/tournaments/{t['id']}/closure-letter/pdf", timeout=60)
        assert r.status_code == 200
        assert r.content.startswith(b"%PDF")
