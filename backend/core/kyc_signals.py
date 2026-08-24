"""Iter 129 · Auxiliary KYC signal extractors.

Small, focused helpers used by the AI validator to build a richer verdict:

  * decode_qr(file_path) — pulls any QR codes out of an image
  * verify_url(url)      — best-effort HTTP fetch to check the QR link resolves
  * summarise_qr_signals(attachments) — combined loop for birth-cert / any doc

Kept intentionally simple; failures are silent so AI validation never breaks
because of a QR reader hiccup.
"""
from __future__ import annotations
import asyncio
import logging
from pathlib import Path
from typing import List, Optional

import httpx
from PIL import Image

logger = logging.getLogger("kyc_signals")

try:
    from pyzbar.pyzbar import decode as _zbar_decode
    HAVE_ZBAR = True
except Exception:  # noqa: BLE001
    HAVE_ZBAR = False


def decode_qr(file_path: str) -> List[str]:
    """Return every distinct QR / barcode payload found in an image or PDF file.

    Iter 129b · PDFs are now supported: we render each page at 200 dpi via
    pdf2image (poppler-utils backend) and run zbar over each page. Result set
    is deduplicated so the caller sees one payload per unique code.
    """
    if not HAVE_ZBAR:
        return []
    p = Path(file_path)
    if not p.exists():
        return []

    seen: List[str] = []

    def _collect_from_image(img):
        try:
            for r in _zbar_decode(img):
                try:
                    data = r.data.decode("utf-8", errors="ignore").strip()
                except Exception:  # noqa: BLE001
                    continue
                if data and data not in seen:
                    seen.append(data)
        except Exception as exc:  # noqa: BLE001
            logger.debug("QR decode inner failure for %s · %s", p.name, exc)

    try:
        if p.suffix.lower() == ".pdf":
            try:
                from pdf2image import convert_from_path
            except ImportError:
                return []
            # 200 dpi is a good balance — fine enough to catch small QRs on
            # Aadhaar / Birth Certificate PDFs without blowing memory on big
            # multi-page documents.
            pages = convert_from_path(str(p), dpi=200, first_page=1, last_page=5)
            for page in pages:
                _collect_from_image(page)
        else:
            img = Image.open(str(p))
            _collect_from_image(img)
        return seen
    except Exception as exc:  # noqa: BLE001
        logger.debug("QR decode failed for %s · %s", p.name, exc)
        return []


async def verify_url(url: str, timeout: float = 6.0) -> dict:
    """Fetch a URL and report whether it resolved. Non-fatal."""
    try:
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
            r = await client.get(url, headers={"User-Agent": "MPCA-ERP/1.0"})
        return {
            "url": url,
            "http_status": r.status_code,
            "ok": r.is_success,
            "final_url": str(r.url),
            "content_type": r.headers.get("content-type", "")[:80],
        }
    except Exception as exc:  # noqa: BLE001
        return {"url": url, "http_status": None, "ok": False, "error": str(exc)[:200]}


async def summarise_qr_signals(items: list) -> List[dict]:
    """Given [(doc_type, file_path), …] return a list of QR verdict dicts.

    Each verdict dict is:
        { doc_type, file_name, qr_found: bool, payloads: [...], upstream: [...] }
    """
    results: List[dict] = []
    for doc_type, path in items:
        payloads = await asyncio.to_thread(decode_qr, path)
        entry = {
            "doc_type": doc_type,
            "file_name": Path(path).name,
            "qr_found": bool(payloads),
            "payloads": payloads,
            "upstream": [],
        }
        # Only test URLs (skip base-64 / plain-text payloads).
        urls = [p for p in payloads if p.lower().startswith(("http://", "https://"))]
        if urls:
            checks = await asyncio.gather(*(verify_url(u) for u in urls), return_exceptions=True)
            entry["upstream"] = [c if isinstance(c, dict) else {"url": urls[i], "ok": False, "error": str(c)} for i, c in enumerate(checks)]
        results.append(entry)
    return results


# ─────────────────────── Address ↔ Division match ───────────────────────

# MP district → Division mapping. Sourced from the same seed the app uses
# for hierarchical scoping (backend/seed.py + body_hierarchy collection).
# Kept here as a lightweight local index so the AI can reason about
# address-proof mismatches without re-reading the DB during validation.
DISTRICT_TO_DIVISION_CODE = {
    # DIV-IND · Indore
    "Indore": "DIV-IND", "Dhar": "DIV-IND", "Jhabua": "DIV-IND", "Alirajpur": "DIV-IND",
    "Khargone": "DIV-IND", "Khandwa": "DIV-IND", "Barwani": "DIV-IND", "Burhanpur": "DIV-IND",
    # DIV-BPL · Bhopal
    "Bhopal": "DIV-BPL", "Raisen": "DIV-BPL", "Sehore": "DIV-BPL", "Vidisha": "DIV-BPL",
    "Rajgarh": "DIV-BPL",
    # DIV-GWL · Gwalior
    "Gwalior": "DIV-GWL", "Shivpuri": "DIV-GWL", "Datia": "DIV-GWL", "Guna": "DIV-GWL",
    "Ashoknagar": "DIV-GWL",
    # DIV-JBP · Jabalpur
    "Jabalpur": "DIV-JBP", "Katni": "DIV-JBP", "Narsinghpur": "DIV-JBP", "Chhindwara": "DIV-JBP",
    "Seoni": "DIV-JBP", "Mandla": "DIV-JBP", "Balaghat": "DIV-JBP", "Dindori": "DIV-JBP",
    # DIV-UJN · Ujjain
    "Ujjain": "DIV-UJN", "Dewas": "DIV-UJN", "Ratlam": "DIV-UJN", "Mandsaur": "DIV-UJN",
    "Neemuch": "DIV-UJN", "Shajapur": "DIV-UJN", "Agar-Malwa": "DIV-UJN",
    # DIV-SGR · Sagar
    "Sagar": "DIV-SGR", "Damoh": "DIV-SGR", "Panna": "DIV-SGR", "Chhatarpur": "DIV-SGR",
    "Tikamgarh": "DIV-SGR", "Niwari": "DIV-SGR",
    # DIV-REW · Rewa
    "Rewa": "DIV-REW", "Satna": "DIV-REW", "Sidhi": "DIV-REW", "Singrauli": "DIV-REW",
    # DIV-SHD · Shahdol
    "Shahdol": "DIV-SHD", "Umaria": "DIV-SHD", "Anuppur": "DIV-SHD",
    # DIV-HSG · Hoshangabad / Narmadapuram
    "Hoshangabad": "DIV-HSG", "Narmadapuram": "DIV-HSG", "Harda": "DIV-HSG", "Betul": "DIV-HSG",
    # DIV-CBL · Chambal
    "Morena": "DIV-CBL", "Bhind": "DIV-CBL", "Sheopur": "DIV-CBL",
}


def divisions_for_district(district_name: Optional[str]) -> Optional[str]:
    """Return the division code that owns this MP district, or None."""
    if not district_name:
        return None
    key = district_name.strip().title()
    return DISTRICT_TO_DIVISION_CODE.get(key)


def build_district_map_hint() -> str:
    """Return a short human-readable summary of the district→division mapping.

    Used inside the AI prompt so the model can reason about mismatches on its
    own without embedding the full mapping table.
    """
    per_div: dict[str, list[str]] = {}
    for district, div_code in DISTRICT_TO_DIVISION_CODE.items():
        per_div.setdefault(div_code, []).append(district)
    lines = []
    for div in sorted(per_div):
        lines.append(f"  - {div}: {', '.join(sorted(per_div[div]))}")
    return "\n".join(lines)
