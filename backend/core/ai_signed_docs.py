"""M39f/g · AI helpers for signed-document review.

Two flows use these:
    * Signed meeting minutes → extract point-by-point resolutions
    * Signed squad nomination PDF → advisory verdict on completeness

Both share the same Gemini file-content pipeline used by
`core.ai_validator._collect_claim_attachments` — we reuse its helpers.
"""
import asyncio
import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from emergentintegrations.llm.chat import (
    LlmChat,
    UserMessage,
    FileContentWithMimeType,
)

EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY")
AI_CALL_TIMEOUT = float(os.environ.get("AI_CALL_TIMEOUT", "45"))
AI_MODEL_PROVIDER = "gemini"
AI_MODEL_NAME = "gemini-3.6-flash"

UPLOAD_DIR = Path(os.environ.get("UPLOAD_DIR", "/app/backend/uploads"))


async def _local_file_from_url(url: str) -> Optional[Path]:
    """Resolve an /api/uploads/<id> URL to the on-disk path.
    Iter 123n · Files are stored under year-month subdirs (see routes/uploads.py::target_dir),
    NOT flat under UPLOAD_DIR. Look up the `_path` on the DB record instead."""
    if not url:
        return None
    m = re.search(r"/uploads/([^/?#]+)$", url)
    if not m:
        return None
    file_id = m.group(1).split(".")[0]
    from core.infra import db as _db
    rec = await _db.uploads.find_one({"id": file_id})
    if not rec:
        return None
    disk_path = rec.get("_path")
    if disk_path and Path(disk_path).exists():
        return Path(disk_path)
    # Legacy fallback — flat UPLOAD_DIR
    p = UPLOAD_DIR / m.group(1)
    return p if p.exists() else None


def _mime_for(path: Path) -> str:
    ext = path.suffix.lower()
    return {
        ".pdf": "application/pdf",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
    }.get(ext, "application/octet-stream")


def _extract_json(raw: str) -> Optional[dict]:
    """Best-effort JSON extraction from a chat reply that may wrap the block in
    ```json fences or prose."""
    if not raw:
        return None
    fenced = re.search(r"```(?:json)?\s*(\{[\s\S]+?\})\s*```", raw)
    payload = fenced.group(1) if fenced else raw
    # Fallback — first {...} block
    if not fenced:
        m = re.search(r"\{[\s\S]+\}", payload)
        if m:
            payload = m.group(0)
    try:
        return json.loads(payload)
    except Exception:
        return None


# ─── M39f · Meeting minutes → resolutions ────────────────────────────────
MINUTES_SYSTEM = (
    "You are the Hon. Secretary of a state cricket association reviewing "
    "signed minutes of a governing-body meeting. Extract each discrete "
    "resolution (one per agenda item) so it can be entered verbatim into "
    "the ERP resolution register. Ignore attendance / procedural noise."
)


MINUTES_USER_TEMPLATE = """Attached is a signed PDF/image of the minutes of the meeting:
    Meeting: {meeting_name} ({meeting_no})
    Type: {meeting_type}
    Date: {meeting_date}
    Chairperson: {chairperson}

Return **STRICT JSON** with this shape (no prose, no code fences, no explanations):
{{
  "summary": "3-4 sentence narrative summary of the meeting.",
  "resolutions": [
    {{
      "number": 1,
      "title": "Short (<=12 words) title for the resolution",
      "text": "Full resolution text, ideally in the language of the minutes.",
      "agenda_no": null,
      "status": "Proposed"
    }}
  ]
}}

Rules:
- One resolution per distinct agenda item passed at the meeting.
- Use "Carried" / "Carried_Unanimously" / "Rejected" / "Deferred" if the minutes explicitly state the outcome, else "Proposed".
- If the minutes have no clear resolutions (e.g. purely a briefing), return an empty resolutions array with a summary.
- Do NOT fabricate resolutions. If uncertain, add a warning to the summary.
"""


async def summarise_signed_minutes(meeting: dict) -> Dict[str, Any]:
    """Runs Gemini over the meeting's `signed_minutes_url`.

    Returns:
        {
          "summary": str,
          "resolutions": [{number, title, text, agenda_no, status}, ...],
          "warnings": [str, ...],
          "raw": str,
        }
    """
    url = meeting.get("signed_minutes_url")
    path = await _local_file_from_url(url) if url else None
    if not path:
        return {"summary": "", "resolutions": [],
                "warnings": ["signed_minutes_url is missing or file not found on disk."], "raw": ""}
    if not EMERGENT_LLM_KEY:
        return {"summary": "", "resolutions": [],
                "warnings": ["EMERGENT_LLM_KEY not configured — AI summarisation skipped."], "raw": ""}

    attachment = FileContentWithMimeType(file_path=str(path), mime_type=_mime_for(path))
    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=f"minutes-{meeting.get('id')}",
        system_message=MINUTES_SYSTEM,
    ).with_model(AI_MODEL_PROVIDER, AI_MODEL_NAME)
    msg = UserMessage(
        text=MINUTES_USER_TEMPLATE.format(
            meeting_name=meeting.get("title", "(untitled)"),
            meeting_no=meeting.get("meeting_no", ""),
            meeting_type=meeting.get("meeting_type", ""),
            meeting_date=meeting.get("scheduled_date", ""),
            chairperson=meeting.get("chairperson", "(not recorded)"),
        ),
        file_contents=[attachment],
    )
    try:
        raw = await asyncio.wait_for(chat.send_message(msg), timeout=AI_CALL_TIMEOUT)
    except Exception as e:
        return {"summary": "", "resolutions": [],
                "warnings": [f"AI call failed: {type(e).__name__}: {str(e)[:200]}"], "raw": ""}

    raw_str = raw if isinstance(raw, str) else str(raw)
    parsed = _extract_json(raw_str) or {}
    resolutions = parsed.get("resolutions") or []
    # Sanitise resolution structure
    clean_res = []
    for i, r in enumerate(resolutions, start=1):
        clean_res.append({
            "number": int(r.get("number") or i),
            "title": (r.get("title") or "")[:200],
            "text": r.get("text") or "",
            "agenda_no": r.get("agenda_no"),
            "status": r.get("status") if r.get("status") in {"Proposed", "Carried", "Carried_Unanimously", "Rejected", "Deferred"} else "Proposed",
        })
    return {
        "summary": parsed.get("summary") or "",
        "resolutions": clean_res,
        "warnings": parsed.get("warnings") or [],
        "raw": raw_str,
    }


# ─── M39g · Signed Squad PDF advisory review ────────────────────────────
SQUAD_SYSTEM = (
    "You are reviewing a signed squad nomination form submitted by a Division "
    "or District secretary of a state cricket association. Your ROLE IS "
    "ADVISORY — the MPCA Secretary makes the final call. Flag anything that "
    "looks off. Do NOT auto-reject; instead classify."
)

SQUAD_USER_TEMPLATE = """Attached is the signed squad nomination PDF/image for:
    Tournament: {tournament_name}  ·  Format: {format_hint}  ·  Category: {category_hint}
    Division/District: {body_name} ({body_code})
    Team: {team_name}

The Division has DIGITALLY selected the following 18-19 players in the ERP roster
(these are the *authoritative* names — the PDF must match them). Below each name
is the player's role, age bracket, category, gender and club/academy so you can
gauge selection quality and highlight any structural bias:

{members_summary}

Please cross-check the attached PDF against this ERP roster AND analyse the
selection quality. Return **STRICT JSON** (no prose, no code fences):
{{
  "verdict": "Looks_Good | Needs_Attention | Reject_Recommended",
  "confidence": 0.0-1.0,
  "signature_present": true | false,
  "official_seal_present": true | false,
  "player_count_matches": true | false,
  "pdf_matches_roster": {{"matched": <int>, "extra_in_pdf": [<name>], "missing_in_pdf": [<name>]}},
  "selection_review": {{
    "gender_balance": "one sentence — e.g. '17M / 2W, women's tournament needs ≥12W'",
    "age_spread": "one sentence — e.g. 'Skewed to Senior (14/19); only 2 U-23 slots filled'",
    "category_mix": "one sentence — e.g. '15 Local_MP · 3 Born_Outside · 1 Guest — within quota'",
    "role_balance": "one sentence — batters/bowlers/all-rounders/wk mix vs typical 6-6-4-2",
    "club_concentration": "one sentence — is any single club/academy over-represented?",
    "bias_flags": ["short bullet on any concerning bias, or empty list if none"]
  }},
  "comments": [
    "3-6 crisp reviewer-facing bullets combining PDF-match + selection observations."
  ],
  "warnings": []
}}

Verdict guide:
- `Looks_Good` — PDF is signed & sealed, ≥95% player names match, selection is balanced.
- `Needs_Attention` — one or two name mismatches, missing seal, or a mild bias flag.
- `Reject_Recommended` — signature missing, ≥3 name mismatches, or serious structural bias
  (e.g. all 19 from one club, or gender-tournament fully wrong-gendered). STILL only advisory.
- Never fabricate. If PDF is unreadable, say so and pick `Needs_Attention`.
"""


async def review_signed_squad(squad: dict, tournament: dict) -> Dict[str, Any]:
    """Runs Gemini over the squad's `signed_copy_url` and returns a rich
    verdict combining PDF cross-check + selection-quality analysis.
    Iter 123n · Now enriches the roster summary with age/gender/category/club
    metadata so the LLM can flag selection bias — not just PDF authenticity."""
    url = squad.get("signed_copy_url")
    path = await _local_file_from_url(url) if url else None
    if not path:
        return {"verdict": "Needs_Attention", "confidence": 0.0, "comments": [],
                "warnings": ["signed_copy_url missing or file not found on disk."], "raw": ""}
    if not EMERGENT_LLM_KEY:
        return {"verdict": "Needs_Attention", "confidence": 0.0, "comments": [],
                "warnings": ["EMERGENT_LLM_KEY not configured — AI review skipped."], "raw": ""}

    # Iter 123n · Enrich each member with age/category/gender/club from the players collection
    from core.infra import db as _db
    from datetime import date as _date
    members = squad.get("members") or []
    member_ids = [m.get("player_id") for m in members if m.get("player_id")]
    players_by_id: Dict[str, dict] = {}
    if member_ids:
        async for p in _db.players.find({"id": {"$in": member_ids}}, {"_id": 0}):
            players_by_id[p["id"]] = p
    def _age(dob_iso: Optional[str]) -> Optional[int]:
        if not dob_iso: return None
        try:
            y, mo, d = map(int, dob_iso[:10].split("-"))
            today = _date.today()
            return today.year - y - (1 if (today.month, today.day) < (mo, d) else 0)
        except Exception: return None
    def _age_bracket(age: Optional[int]) -> str:
        if age is None: return "?"
        if age < 14: return "U-14"
        if age < 16: return "U-16"
        if age < 19: return "U-19"
        if age < 23: return "U-23"
        if age < 40: return "Senior"
        return "Veteran"
    lines = []
    for m in members[:22]:
        pid = m.get("player_id")
        p = players_by_id.get(pid) or {}
        age = _age(p.get("date_of_birth"))
        lines.append(
            f"  · {p.get('full_name') or m.get('player_name') or '?'} "
            f"· {(m.get('role') or p.get('role') or '?').replace('_', ' ')}"
            f" · age {age or '?'} ({_age_bracket(age)})"
            f" · {p.get('gender') or '?'}"
            f" · {p.get('category') or '?'}"
            f" · {p.get('club_academy') or '(no club)'}"
        )
    members_summary = "\n".join(lines) or "  · (empty roster)"

    tournament_name = (tournament or {}).get("name", "(unknown tournament)")
    format_hint = (tournament or {}).get("format") or (tournament or {}).get("match_format") or "?"
    category_hint = (tournament or {}).get("category") or (tournament or {}).get("age_group") or "Senior · Men"

    attachment = FileContentWithMimeType(file_path=str(path), mime_type=_mime_for(path))
    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=f"squad-{squad.get('id')}",
        system_message=SQUAD_SYSTEM,
    ).with_model(AI_MODEL_PROVIDER, AI_MODEL_NAME)
    msg = UserMessage(
        text=SQUAD_USER_TEMPLATE.format(
            tournament_name=tournament_name,
            format_hint=format_hint,
            category_hint=category_hint,
            body_name=squad.get("body_id") or "?",
            body_code=squad.get("body_id") or "?",
            team_name=squad.get("team_name") or "?",
            members_summary=members_summary,
        ),
        file_contents=[attachment],
    )
    try:
        raw = await asyncio.wait_for(chat.send_message(msg), timeout=AI_CALL_TIMEOUT)
    except Exception as e:
        return {"verdict": "Needs_Attention", "confidence": 0.0, "comments": [],
                "warnings": [f"AI call failed: {type(e).__name__}: {str(e)[:200]}"], "raw": ""}

    raw_str = raw if isinstance(raw, str) else str(raw)
    parsed = _extract_json(raw_str) or {}
    verdict = parsed.get("verdict")
    if verdict not in {"Looks_Good", "Needs_Attention", "Reject_Recommended"}:
        verdict = "Needs_Attention"
    return {
        "verdict": verdict,
        "confidence": float(parsed.get("confidence") or 0.0),
        "comments": [str(c) for c in (parsed.get("comments") or [])][:20],
        "signature_present": parsed.get("signature_present"),
        "official_seal_present": parsed.get("official_seal_present"),
        "player_count_matches": parsed.get("player_count_matches"),
        "pdf_matches_roster": parsed.get("pdf_matches_roster") or {},
        "selection_review": parsed.get("selection_review") or {},
        "warnings": [str(w) for w in (parsed.get("warnings") or [])][:10],
        "raw": raw_str,
    }
