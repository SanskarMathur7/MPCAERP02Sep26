"""Iter 128/129 · SMS helper with pluggable provider.

Provider is picked from the SMS_PROVIDER env var:

    * "twilio"  → Twilio Programmable SMS (works today, no DLT needed for a US
                  long-code sending to Indian numbers, at ~₹0.50 / SMS).
    * "msg91"   → MSG91 DLT Flow API (Indian-native, ~₹0.15 / SMS, needs
                  DLT PE + Sender ID + Template approval).

If SMS_PROVIDER is unset OR the required credentials for the selected provider
are missing, the helper mock-logs the intended SMS instead of sending — so
dev / preview never crashes.

Required env vars per provider
──────────────────────────────
Twilio:  TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM (E.164)
MSG91:   MSG91_AUTHKEY, MSG91_TEMPLATE_ID  (+ optional MSG91_SENDER_ID)
"""
from __future__ import annotations
import asyncio
import logging
import os
from typing import Optional

import httpx

logger = logging.getLogger("sms_notifications")

MSG91_URL = "https://control.msg91.com/api/v5/flow/"


# ═══════════════════════════════ helpers ═══════════════════════════════

def _provider() -> str:
    return (os.environ.get("SMS_PROVIDER") or "").strip().lower()


def _normalise_indian(mobile: str) -> Optional[str]:
    """Return MSG91-safe `91XXXXXXXXXX` (12 digits, no +). None if invalid."""
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


def _to_e164(mobile: str) -> Optional[str]:
    """Return Twilio-safe E.164 `+91XXXXXXXXXX`. None if invalid."""
    n = _normalise_indian(mobile)
    return f"+{n}" if n else None


# ═══════════════════════════════ Twilio ═══════════════════════════════

def _twilio_config() -> Optional[dict]:
    sid = os.environ.get("TWILIO_ACCOUNT_SID")
    token = os.environ.get("TWILIO_AUTH_TOKEN")
    from_num = os.environ.get("TWILIO_FROM")
    if not (sid and token and from_num):
        return None
    return {"sid": sid, "token": token, "from_": from_num}


def _twilio_send_sync(to_e164: str, body: str, cfg: dict) -> dict:
    """Blocking Twilio SDK call — runs in a worker thread from the async caller."""
    try:
        from twilio.rest import Client
        from twilio.base.exceptions import TwilioRestException
    except ImportError:
        return {"status": "failed", "error": "twilio SDK not installed"}
    try:
        client = Client(cfg["sid"], cfg["token"])
        msg = client.messages.create(to=to_e164, from_=cfg["from_"], body=body)
        return {
            "status": "sent",
            "to": to_e164,
            "provider": "twilio",
            "sid": msg.sid,
            "twilio_status": msg.status,
        }
    except TwilioRestException as exc:
        logger.warning("Twilio rejected SMS · code=%s msg=%s", exc.code, exc.msg)
        return {"status": "failed", "provider": "twilio", "code": exc.code, "error": exc.msg}
    except Exception as exc:  # noqa: BLE001
        logger.exception("Twilio SMS failure")
        return {"status": "failed", "provider": "twilio", "error": str(exc)}


async def _twilio_send(to_e164: str, body: str, cfg: dict) -> dict:
    return await asyncio.to_thread(_twilio_send_sync, to_e164, body, cfg)


# ═══════════════════════════════ MSG91 ═══════════════════════════════

def _msg91_config() -> Optional[dict]:
    authkey = os.environ.get("MSG91_AUTHKEY")
    template_id = os.environ.get("MSG91_TEMPLATE_ID")
    if not (authkey and template_id):
        return None
    return {
        "authkey": authkey,
        "template_id": template_id,
        "sender_id": os.environ.get("MSG91_SENDER_ID"),
        "short_url": os.environ.get("MSG91_SHORT_URL") or "0",
    }


async def _msg91_send(to_12: str, link: str, cfg: dict) -> dict:
    """MSG91 Flow template variable is `var1` — must match DLT template exactly."""
    payload = {
        "template_id": cfg["template_id"],
        "short_url": cfg["short_url"],
        "recipients": [{"mobiles": to_12, "var1": link}],
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
            return {"status": "failed", "provider": "msg91", "to": to_12, "provider_response": body}
        return {"status": "sent", "provider": "msg91", "to": to_12, "provider_response": body}
    except Exception as exc:  # noqa: BLE001
        logger.exception("MSG91 SMS failure")
        return {"status": "failed", "provider": "msg91", "to": to_12, "error": str(exc)}


# ═════════════════════════════ Public API ═════════════════════════════

async def send_correction_sms(mobile: str, link: str) -> dict:
    """Dispatch the player-correction SMS via the configured provider.

    Both providers mock-log if their credentials are missing — never fatal.
    """
    provider = _provider()

    # Try Twilio path
    if provider == "twilio":
        cfg = _twilio_config()
        to_e164 = _to_e164(mobile)
        if not to_e164:
            return {"status": "skipped", "reason": "invalid mobile"}
        if not cfg:
            logger.info("[SMS · MOCKED — Twilio not configured] to=%s link=%s", to_e164, link)
            return {"status": "mocked", "provider": "twilio", "to": to_e164, "link": link}
        body = f"MPCA: Please correct your player registration. Open: {link} (link valid 7 days). Do not share."
        return await _twilio_send(to_e164, body, cfg)

    # MSG91 path (also the default when SMS_PROVIDER is unset)
    cfg = _msg91_config()
    to_12 = _normalise_indian(mobile)
    if not to_12:
        return {"status": "skipped", "reason": "invalid mobile"}
    if not cfg:
        logger.info("[SMS · MOCKED — MSG91 not configured] to=%s link=%s", to_12, link)
        return {"status": "mocked", "provider": "msg91", "to": to_12, "link": link}
    return await _msg91_send(to_12, link, cfg)
