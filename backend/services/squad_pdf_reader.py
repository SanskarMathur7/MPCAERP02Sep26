"""services/squad_pdf_reader.py — Iter 108f.

Reads a signed-squad PDF (uploaded to /api/uploads or an external URL) using
Gemini vision and returns a structured roster.  Used by:

    POST /api/tournaments/{tid}/parse-signed-squad   (MPCA manual-PDF flow)
    POST /api/squads/{sid}/verify-signed-copy        (Division register-linked flow)

Return shape
────────────
    {
        "captain":       "Rajat Patidar",
        "vice_captain":  "Venkatesh Iyer",
        "players": [
            {"name": "Rajat Patidar",    "role": "Batter",      "jersey": "23"},
            {"name": "Kumar Kartikeya",  "role": "Bowler",      "jersey": "17"},
            ...
        ],
        "total_players": 15,
        "confidence":    0.92,
        "raw_response":  "<gemini's markdown>",
    }
"""
import base64
import json
import logging
import os
import re
from typing import Optional

import httpx

log = logging.getLogger("squad_pdf_reader")

PROMPT = """You are reading a signed cricket team-list PDF for the Madhya Pradesh Cricket Association.
Extract the roster as strict JSON with this exact shape (no markdown fences, no prose):

{
  "captain":      "<full name, or empty string if not marked>",
  "vice_captain": "<full name, or empty string>",
  "players": [
    {"name": "<full name>", "role": "<Batter|Bowler|All-rounder|WK|Unknown>", "jersey": "<number or empty>"}
  ],
  "confidence": <0.0..1.0>
}

Rules:
- Names must be extracted VERBATIM from the document (Indian name conventions: preserve capitalisation, initials, honorifics).
- "role" must map to one of the five values above.  If the PDF just says "batsman", output "Batter".
- If the same person appears as both captain and in the player list, keep them in players and mark them via the captain field.
- If a player has "(C)" or "(Captain)" next to their name, put them in captain and also keep them in players.
- If "(VC)" or "(Vice Captain)" — same for vice_captain.
- Ignore coach / manager / physio names — players only.
- Return between 11 and 20 players; if fewer/more, still return what you can extract and lower confidence.
- Output ONLY the JSON object — no code fences, no explanations.
"""


async def _fetch_bytes(url: str) -> bytes:
    """Fetch bytes for a signed-copy URL.
    For local `/api/uploads/{id}` URLs we read the file straight off disk
    via the `uploads` collection (looking up the persisted `_path`). This
    sidesteps the JWT-gated HTTP route entirely — Iter 123m — which was
    returning 401 to the internal httpx call and failing every "Verify with
    AI" attempt with `Not authenticated`. Absolute `http(s)://` URLs still
    go through httpx for backwards-compat with external doc stores."""
    if url.startswith("/api/uploads/"):
        from pathlib import Path
        from core.infra import db as _db
        file_id = url.rsplit("/", 1)[-1].split("?", 1)[0]
        rec = await _db.uploads.find_one({"id": file_id})
        if not rec:
            raise RuntimeError(f"Upload record {file_id} not found in the database.")
        path = rec.get("_path")
        if not path or not Path(path).exists():
            raise RuntimeError(f"Upload {file_id} exists in DB but file is missing on disk.")
        return Path(path).read_bytes()
    if url.startswith("/"):
        # Non-upload local paths — fall back to internal HTTP (rare)
        backend = os.environ.get("BACKEND_INTERNAL_URL", "http://localhost:8001")
        url = f"{backend}{url}"
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.get(url)
        r.raise_for_status()
        return r.content


def _extract_json(text: str) -> Optional[dict]:
    """Gemini sometimes wraps JSON in ```json fences even when told not to."""
    if not text:
        return None
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```\s*$", "", text)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        # Try to find the first { … } block
        m = re.search(r"\{.*\}", text, re.DOTALL)
        if m:
            try: return json.loads(m.group(0))
            except json.JSONDecodeError: return None
    return None


async def parse_squad_pdf(url: str) -> dict:
    """Read a signed squad PDF/image and return a structured roster.
    Raises RuntimeError with a friendly message on failure — the caller
    should surface that back to the UI."""
    try:
        blob = await _fetch_bytes(url)
    except Exception as e:
        raise RuntimeError(f"Could not fetch the PDF: {e}") from e

    is_pdf = blob[:4] == b"%PDF"
    mime = "application/pdf" if is_pdf else "image/jpeg"

    # Use emergentintegrations Gemini vision.  We import lazily so a missing
    # dep or key doesn't crash the entire backend at boot.
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage, FileContentWithMimeType  # noqa: E501
    except Exception as e:  # noqa: BLE001
        raise RuntimeError(f"AI reader unavailable: {e}") from e

    key = os.environ.get("EMERGENT_LLM_KEY")
    if not key:
        raise RuntimeError("EMERGENT_LLM_KEY missing")

    # Save to a tmp path — FileContentWithMimeType wants a file path
    import tempfile
    ext = "pdf" if is_pdf else "jpg"
    with tempfile.NamedTemporaryFile(suffix=f".{ext}", delete=False) as f:
        f.write(blob)
        tmp_path = f.name

    try:
        chat = LlmChat(
            api_key=key,
            session_id=f"squad-pdf-{os.path.basename(tmp_path)}",
            system_message="You extract cricket squad rosters from signed team-list PDFs.",
        ).with_model("gemini", "gemini-3.6-flash")
        msg = UserMessage(
            text=PROMPT,
            file_contents=[FileContentWithMimeType(file_path=tmp_path, mime_type=mime)],
        )
        raw = await chat.send_message(msg)
    except Exception as e:  # noqa: BLE001
        raise RuntimeError(f"AI reader failed: {e}") from e
    finally:
        try: os.unlink(tmp_path)
        except OSError: pass

    parsed = _extract_json(raw) or {}
    players = parsed.get("players") or []
    return {
        "captain":       (parsed.get("captain") or "").strip(),
        "vice_captain":  (parsed.get("vice_captain") or "").strip(),
        "players":       [{
            "name":   (p.get("name") or "").strip(),
            "role":   (p.get("role") or "Unknown").strip(),
            "jersey": str(p.get("jersey") or "").strip(),
        } for p in players if p.get("name")],
        "total_players": len(players),
        "confidence":    float(parsed.get("confidence") or 0.0),
        "raw_response":  raw[:2000] if isinstance(raw, str) else "",
    }


# ─────────────── Fuzzy-name matcher for register cross-check ───────────────

def _norm(s: str) -> str:
    return re.sub(r"[^a-z]", "", (s or "").lower())


def _initials(s: str) -> str:
    return "".join(p[0] for p in (s or "").split() if p)


def match_score(a: str, b: str) -> float:
    """0-1 fuzzy match — exact >> initials-match >> substring."""
    na, nb = _norm(a), _norm(b)
    if not na or not nb: return 0.0
    if na == nb: return 1.0
    if na in nb or nb in na: return 0.9
    # Levenshtein-lite: matching character positions
    common = sum(1 for x, y in zip(na, nb) if x == y)
    lev = common / max(len(na), len(nb))
    if lev >= 0.85: return 0.85
    # Initials + last-name
    if _initials(a).lower() == _initials(b).lower() and lev > 0.5:
        return 0.75
    return lev


def cross_check_roster(pdf_players: list[dict], register_players: list[dict]) -> dict:
    """Compare OCR'd PDF names against the digitally-picked roster.
    Returns matched / missing_in_pdf / extra_in_pdf and an overall %."""
    unmatched_reg = list(register_players)
    matched, extra = [], []
    for pp in pdf_players:
        best = (0.0, None)
        for rp in unmatched_reg:
            score = match_score(pp.get("name", ""), rp.get("full_name", ""))
            if score > best[0]:
                best = (score, rp)
        if best[0] >= 0.75 and best[1]:
            matched.append({"pdf": pp, "register": best[1], "score": round(best[0], 2)})
            unmatched_reg.remove(best[1])
        else:
            extra.append(pp)
    total = max(len(pdf_players), len(register_players), 1)
    match_pct = round((len(matched) / total) * 100)
    return {
        "matched":         matched,
        "missing_in_pdf":  unmatched_reg,   # in register, absent from PDF
        "extra_in_pdf":    extra,           # in PDF, not in register
        "match_pct":       match_pct,
        "verdict":         "clean" if match_pct >= 90 else "review",
    }
