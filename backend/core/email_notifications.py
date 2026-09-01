"""MPCA-118 · SMTP email helper.

Best-effort email dispatch used for high-priority ERP events. Uses standard
SMTP env vars (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`,
`SMTP_FROM`, `SMTP_TLS`). If any of these are missing we log the intended
mail as MOCKED so development/preview environments never crash. Production
deployments wire up the env vars and the same code path sends the mail.

Priority events wired today:
    · Meeting invitation on create           → send_meeting_invitation()
    · Grant claim rejected on audit          → send_claim_rejection_notice()
    · Budget sanctioned by MPCA              → send_budget_sanctioned_notice()
    · Birthday greeting                      → send_birthday_greeting()
"""
from __future__ import annotations
import logging
import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Iterable, Optional

from core.infra import db

logger = logging.getLogger("email_notifications")


def _smtp_config() -> Optional[dict]:
    host = os.environ.get("SMTP_HOST")
    if not host:
        return None
    return {
        "host": host,
        "port": int(os.environ.get("SMTP_PORT") or 587),
        "user": os.environ.get("SMTP_USER"),
        "password": os.environ.get("SMTP_PASS"),
        "from_addr": os.environ.get("SMTP_FROM") or "no-reply@mpcaonline.com",
        "use_tls": (os.environ.get("SMTP_TLS") or "true").lower() != "false",
    }


async def send_email(
    to: str | Iterable[str],
    subject: str,
    html_body: str,
    text_body: Optional[str] = None,
) -> dict:
    """Dispatch email via configured SMTP or mock-log if unwired.

    Returns a small dict describing what happened — non-fatal on any error.
    """
    recipients = [to] if isinstance(to, str) else list(to)
    recipients = [r for r in recipients if r]
    if not recipients:
        return {"status": "skipped", "reason": "no recipients"}

    cfg = _smtp_config()
    if not cfg:
        logger.info("[EMAIL · MOCKED — no SMTP_HOST set] to=%s subject=%r", recipients, subject)
        return {"status": "mocked", "to": recipients, "subject": subject}

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = cfg["from_addr"]
    msg["To"] = ", ".join(recipients)
    if text_body:
        msg.attach(MIMEText(text_body, "plain", "utf-8"))
    msg.attach(MIMEText(html_body, "html", "utf-8"))

    try:
        server = smtplib.SMTP(cfg["host"], cfg["port"], timeout=15)
        try:
            if cfg["use_tls"]:
                server.starttls()
            if cfg["user"]:
                server.login(cfg["user"], cfg["password"] or "")
            server.sendmail(cfg["from_addr"], recipients, msg.as_string())
        finally:
            server.quit()
        return {"status": "sent", "to": recipients, "subject": subject}
    except Exception as e:  # noqa: BLE001
        logger.warning("[EMAIL · SMTP ERROR] to=%s subject=%r err=%s", recipients, subject, e)
        return {"status": "error", "error": str(e), "to": recipients}


# ═══════════════════════════════════════════════════════════════════════════
# High-priority event templates
# ═══════════════════════════════════════════════════════════════════════════

def _wrap_html(title: str, body_html: str) -> str:
    return f"""
<div style="font-family:'Playfair Display',Georgia,serif;background:#F4EDE0;padding:24px;">
    <div style="max-width:640px;margin:0 auto;background:#FFF;border:2px solid #7A1A1A;padding:24px;">
        <div style="border-bottom:1px solid #C9A574;padding-bottom:12px;margin-bottom:16px;">
            <div style="color:#7A1A1A;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;">MPCA · Madhya Pradesh Cricket Association</div>
            <h1 style="margin:6px 0 0;color:#1B2E1E;font-size:22px;">{title}</h1>
        </div>
        <div style="font-family:Georgia,serif;color:#333;font-size:14px;line-height:1.6;">{body_html}</div>
        <div style="margin-top:20px;padding-top:12px;border-top:1px solid #C9A574;color:#6b6b6b;font-size:11px;">
            You're receiving this because you are on the MPCA active roster. Contact the Secretariat if this is unexpected.
        </div>
    </div>
</div>
"""


async def send_meeting_invitation(meeting) -> dict:
    """Send invitation to all attendees whose members record has an email.

    Feb 2026 · MPCA-114 · If the meeting has attached documents, list them
    in the email so invitees can preview / download before the meeting.
    """
    doc = meeting.model_dump() if hasattr(meeting, "model_dump") else meeting
    attendee_ids = doc.get("attendees") or []
    external = doc.get("external_attendees") or []
    recipients: set[str] = set()
    if attendee_ids:
        async for m in db.members.find({"id": {"$in": list(attendee_ids)}}, {"_id": 0, "email": 1}):
            if m.get("email"):
                recipients.add(m["email"])
    for ex in external:
        if ex.get("email"):
            recipients.add(ex["email"])
    if not recipients:
        return {"status": "skipped", "reason": "no attendees with email"}
    subject = f"[MPCA] Meeting Invitation — {doc.get('title')}"
    when = f"{doc.get('scheduled_date')} {doc.get('scheduled_time') or ''}".strip()
    # MPCA-114 · Documents block
    docs = doc.get("documents") or []
    docs_html = ""
    if docs:
        rows = "".join(
            f'<li style="margin:2px 0;"><a href="{d.get("url")}" style="color:#7A1A1A;text-decoration:underline;">{d.get("name") or "Attached document"}</a></li>'
            for d in docs if d.get("url")
        )
        docs_html = f"""
        <div style="margin:14px 0;padding:10px 12px;background:#F5EFE6;border-left:3px solid #B88328;">
            <div style="color:#7A1A1A;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;font-weight:700;margin-bottom:6px;">
                Documents attached ({len(docs)})
            </div>
            <ul style="margin:0;padding-left:18px;font-size:13px;color:#333;">{rows}</ul>
        </div>"""
    body = _wrap_html("Meeting Invitation", f"""
        <p>You are invited to attend the following meeting.</p>
        <table style="width:100%;font-size:13px;margin:8px 0;">
            <tr><td style="color:#6b6b6b;padding:4px 0;">Meeting</td><td><b>{doc.get('title')}</b></td></tr>
            <tr><td style="color:#6b6b6b;padding:4px 0;">Type</td><td>{doc.get('meeting_type')}</td></tr>
            <tr><td style="color:#6b6b6b;padding:4px 0;">Date &amp; Time</td><td>{when}</td></tr>
            <tr><td style="color:#6b6b6b;padding:4px 0;">Venue</td><td>{doc.get('venue')}</td></tr>
            <tr><td style="color:#6b6b6b;padding:4px 0;">Chair</td><td>{doc.get('chairperson') or '—'}</td></tr>
        </table>
        {docs_html}
        <p style="color:#7A1A1A;font-weight:600;">Meeting ref · {doc.get('meeting_no')}</p>
    """)
    return await send_email(list(recipients), subject, body)


async def send_action_item_notification(member_id: str, subject_line: str, body_text: str, action_url: Optional[str] = None) -> dict:
    """Feb 2026 · MPCA-118 · Send an email whenever a new action item lands
    in a member's action-centre inbox. `subject_line` becomes the email
    subject; `body_text` is rendered in a single paragraph. Best-effort —
    silently no-ops if the member has no email on file."""
    m = await db.members.find_one({"id": member_id}, {"_id": 0, "email": 1, "full_name": 1})
    if not m or not m.get("email"):
        return {"status": "skipped", "reason": "no email"}
    cta = ""
    if action_url:
        cta = f'<p><a href="{action_url}" style="display:inline-block;margin-top:8px;padding:8px 16px;background:#7A1A1A;color:#F5EFE6;text-decoration:none;font-size:12px;letter-spacing:0.14em;text-transform:uppercase;">Open Action</a></p>'
    body = _wrap_html("New Action Required", f"""
        <p>Dear {m.get("full_name") or "Member"},</p>
        <p>{body_text}</p>
        {cta}
        <p style="color:#6b6b6b;font-size:11px;">This item is now visible in your MPCA ERP Action Centre.</p>
    """)
    return await send_email(m["email"], f"[MPCA · Action Required] {subject_line}", body)



async def send_claim_rejection_notice(claim: dict, reason: str) -> dict:
    subject = f"[MPCA] Grant Claim {claim.get('claim_no') or claim.get('id')} Rejected on Audit"
    body = _wrap_html("Grant Claim Rejected (Audit Finding)", f"""
        <p>The MPCA audit has rejected a previously-approved grant claim. The claim will
        remain visible in your Approved list with a REJECTED status pill until you address
        the finding and re-submit.</p>
        <p><b>Reason:</b> {reason}</p>
        <p><b>Claim:</b> {claim.get('scheme_code')} · {claim.get('body_id')} · ₹{claim.get('claim_amount_inr'):,.0f}</p>
    """)
    to = claim.get("submitted_by_email") or claim.get("body_email")
    return await send_email(to, subject, body)


async def send_birthday_greeting(member: dict) -> dict:
    if not member.get("email"):
        return {"status": "skipped", "reason": "no email"}
    subject = "[MPCA] Warmest birthday wishes from Madhya Pradesh Cricket Association"
    body = _wrap_html("Happy Birthday!", f"""
        <p>Dear {member.get('full_name') or member.get('name') or 'Member'},</p>
        <p>The Madhya Pradesh Cricket Association family wishes you a joyous birthday and
        a year of good health, happiness and cricketing memories.</p>
        <p style="color:#7A1A1A;font-style:italic;">— MPCA Secretariat</p>
    """)
    return await send_email(member["email"], subject, body)
