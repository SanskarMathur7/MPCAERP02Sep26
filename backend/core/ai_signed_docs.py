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
AI_MODEL_NAME = "gemini-3-flash-preview"

UPLOAD_DIR = Path(os.environ.get("UPLOAD_DIR", "/app/backend/uploads"))


def _local_file_from_url(url: str) -> Optional[Path]:
    """Resolve an /api/uploads/<name> URL back to the on-disk path."""
    if not url:
        return None
    # Accepts "/api/uploads/xyz.pdf" or absolute URLs pointing to the same
    m = re.search(r"/uploads/([^/?#]+)$", url)
    if not m:
        return None
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
    path = _local_file_from_url(url) if url else None
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
    Tournament: {tournament_name}
    Division/District: {body_name} ({body_code})
    Team: {team_name}
    Roster in ERP (name · role · UID): {members_summary}

Return **STRICT JSON** (no prose, no code fences):
{{
  "verdict": "Looks_Good | Needs_Attention | Reject_Recommended",
  "confidence": 0.0-1.0,
  "comments": [
    "Bullet-point observation, e.g. 'Signature present in bottom-right corner.'",
    "'Player X on the PDF (Ravi K) is not in the ERP roster — check name spelling.'"
  ],
  "signature_present": true,
  "official_seal_present": true,
  "player_count_matches": true,
  "warnings": []
}}

Guidelines:
- `Looks_Good` — signed, sealed, players match roster (allowing minor spelling drift).
- `Needs_Attention` — one or two issues (missing seal, one name mismatch, unclear date).
- `Reject_Recommended` — signature missing, wrong tournament header, obvious tampering, or ≥3 player mismatches. STILL only advisory.
- Never fabricate observations. If the PDF is unreadable, say so and set verdict to `Needs_Attention`.
"""


async def review_signed_squad(squad: dict, tournament: dict) -> Dict[str, Any]:
    """Runs Gemini over the squad's `signed_copy_url`.

    Returns:
        {
          "verdict": str,
          "confidence": float,
          "comments": [str],
          "warnings": [str],
          "signature_present": bool | None,
          "official_seal_present": bool | None,
          "player_count_matches": bool | None,
          "raw": str,
        }
    """
    url = squad.get("signed_copy_url")
    path = _local_file_from_url(url) if url else None
    if not path:
        return {"verdict": "Needs_Attention", "confidence": 0.0, "comments": [],
                "warnings": ["signed_copy_url missing or file not found on disk."], "raw": ""}
    if not EMERGENT_LLM_KEY:
        return {"verdict": "Needs_Attention", "confidence": 0.0, "comments": [],
                "warnings": ["EMERGENT_LLM_KEY not configured — AI review skipped."], "raw": ""}

    members = squad.get("members") or []
    members_summary = "; ".join([
        f"{m.get('player_name') or m.get('name') or '?'} · {m.get('role') or '?'} · {m.get('uid') or ''}"
        for m in members[:20]
    ]) or "(empty roster)"

    attachment = FileContentWithMimeType(file_path=str(path), mime_type=_mime_for(path))
    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=f"squad-{squad.get('id')}",
        system_message=SQUAD_SYSTEM,
    ).with_model(AI_MODEL_PROVIDER, AI_MODEL_NAME)
    msg = UserMessage(
        text=SQUAD_USER_TEMPLATE.format(
            tournament_name=tournament.get("name", "(unknown tournament)") if tournament else "(unknown)",
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
        "warnings": [str(w) for w in (parsed.get("warnings") or [])][:10],
        "raw": raw_str,
    }
