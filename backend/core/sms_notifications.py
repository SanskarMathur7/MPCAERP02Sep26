"""Iter 128 · MSG91 DLT-compliant SMS helper.

Best-effort SMS dispatch for high-priority ERP events (currently: player
correction-request link). Requires three env vars:

    * MSG91_AUTHKEY      — Authkey from MSG91 dashboard → Setting → API
    * MSG91_TEMPLATE_ID  — DLT-approved Flow / Template ID
    * MSG91_SENDER_ID    — Optional; only needed if the Flow is FromAPI

If any are missing we log the intended SMS as MOCKED so dev / preview never
crashes. Production wires the env vars — same code path sends the SMS.

Playbook reference: `integration_playbook_expert_v2` (24 Aug 2026).
"""
from __future__ import annotations
import logging
import os
from typing import Optional

import httpx

logger = logging.getLogger("sms_notifications")

MSG91_URL = "https://control.msg91.com/api/v5/flow/"


def _msg91_config() -> Optional[dict]:
    authkey = os.environ.get("MSG91_AUTHKEY")
    template_id = os.environ.get("MSG91_TEMPLATE_ID")
    if not authkey or not template_id:
        return None
    return {
        "authkey": authkey,
        "template_id": template_id,
        "sender_id": os.environ.get("MSG91_SENDER_ID"),
        "short_url": os.environ.get("MSG91_SHORT_URL") or "0",
    }


def _normalise_indian(mobile: str) -> Optional[str]:
    """Return MSG91-safe `91XXXXXXXXXX`. None on invalid."""
    if not mobile:
        return None
    digits = "".join(c for c in mobile if c.isdigit())
    if digits.startswith("0") and len(digits) == 11:
        digits = "91" + digits[1:]
    if len(digits) == 10:
        digits = "91" + digits
    if len(digits) != 12 or not digits.startswith("91"):
        return None
    return digits


async def send_correction_sms(mobile: str, link: str) -> dict:
    """Dispatch the player-correction SMS via MSG91 or mock-log if unwired.

    MSG91 Flow template variable is `var1` (must match DLT template exactly).
    Returns a small dict describing what happened — non-fatal on any error.
    """
    normalised = _normalise_indian(mobile)
    if not normalised:
        return {"status": "skipped", "reason": "invalid mobile"}

    cfg = _msg91_config()
    if not cfg:
        logger.info("[SMS · MOCKED — no MSG91_AUTHKEY / MSG91_TEMPLATE_ID] to=%s link=%s",
                    normalised, link)
        return {"status": "mocked", "to": normalised, "link": link}

    payload = {
        "template_id": cfg["template_id"],
        "short_url": cfg["short_url"],
        "recipients": [{"mobiles": normalised, "var1": link}],
    }
    if cfg.get("sender_id"):
        payload["sender"] = cfg["sender_id"]

    headers = {
        "accept": "application/json",
        "content-type": "application/json",
        "authkey": cfg["authkey"],
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(MSG91_URL, json=payload, headers=headers)
        try:
            body = response.json()
        except ValueError:
            body = {"raw": response.text[:500]}
        accepted = response.is_success and body.get("type") == "success"
        if not accepted:
            logger.warning("MSG91 rejected SMS · http=%s type=%s", response.status_code, body.get("type"))
            return {"status": "failed", "to": normalised, "provider_response": body}
        return {"status": "sent", "to": normalised, "provider_response": body}
    except Exception as exc:  # noqa: BLE001
        logger.exception("MSG91 SMS failure")
        return {"status": "failed", "to": normalised, "error": str(exc)}
