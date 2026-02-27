"""Transactional email service.

Backend is selected by the EMAIL_BACKEND config setting:
  "ses"  — AWS SES via boto3 (uses ECS task IAM role, no credentials needed)
  "smtp" — Generic SMTP via aiosmtplib (configure SMTP_* settings)
  "log"  — Prints the link to stdout (local development default)
"""
import asyncio
import logging
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app.core.config import settings

logger = logging.getLogger(__name__)


def _build_reset_message(to_email: str, reset_url: str) -> tuple[str, str]:
    """Return (plain_text, html) for a password-reset email."""
    plain = f"""\
You requested a password reset for your GoUsers account.

Click the link below to set a new password (valid for 1 hour):

{reset_url}

If you did not request this, you can safely ignore this email.
"""
    html = f"""\
<html><body style="font-family:sans-serif;color:#1a1d27;background:#f5f5f5;padding:32px">
  <div style="max-width:480px;margin:auto;background:#fff;border-radius:8px;padding:32px;border:1px solid #e5e7eb">
    <h2 style="margin-top:0">Reset your GoUsers password</h2>
    <p>You requested a password reset. Click the button below — the link expires in <strong>1 hour</strong>.</p>
    <p style="text-align:center;margin:32px 0">
      <a href="{reset_url}"
         style="background:#5865f2;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600">
        Reset password
      </a>
    </p>
    <p style="color:#6b7280;font-size:13px">
      If you didn't request this you can safely ignore this email.
    </p>
  </div>
</body></html>
"""
    return plain, html


async def _send_ses(to_email: str, reset_url: str) -> None:
    """Send via AWS SES using boto3 (async-safe via thread executor)."""
    import boto3  # imported lazily — not available in local dev without boto3 installed

    plain, html = _build_reset_message(to_email, reset_url)

    def _do_send():
        client = boto3.client("ses", region_name=settings.SES_REGION)
        client.send_email(
            Source=settings.SES_FROM_EMAIL,
            Destination={"ToAddresses": [to_email]},
            Message={
                "Subject": {"Data": "Reset your GoUsers password", "Charset": "UTF-8"},
                "Body": {
                    "Text": {"Data": plain, "Charset": "UTF-8"},
                    "Html": {"Data": html, "Charset": "UTF-8"},
                },
            },
        )

    loop = asyncio.get_running_loop()
    await loop.run_in_executor(None, _do_send)


async def _send_smtp(to_email: str, reset_url: str) -> None:
    """Send via SMTP using aiosmtplib."""
    import aiosmtplib

    plain, html = _build_reset_message(to_email, reset_url)

    msg = MIMEMultipart("alternative")
    msg["Subject"] = "Reset your GoUsers password"
    msg["From"] = settings.SMTP_FROM
    msg["To"] = to_email
    msg.attach(MIMEText(plain, "plain"))
    msg.attach(MIMEText(html, "html"))

    await aiosmtplib.send(
        msg,
        hostname=settings.SMTP_HOST,
        port=settings.SMTP_PORT,
        username=settings.SMTP_USER or None,
        password=settings.SMTP_PASSWORD or None,
        start_tls=True,
    )


async def send_reset_email(to_email: str, reset_url: str) -> None:
    """Send a password-reset email using the configured backend.

    Falls back to logging the link if the configured backend fails (e.g. SES sandbox mode).
    """
    backend = settings.EMAIL_BACKEND.lower()

    try:
        if backend == "ses":
            await _send_ses(to_email, reset_url)
            logger.info("Password reset email sent via SES to %s", to_email)
            return
        elif backend == "smtp":
            if not settings.SMTP_HOST:
                raise ValueError("EMAIL_BACKEND=smtp but SMTP_HOST is not configured")
            await _send_smtp(to_email, reset_url)
            logger.info("Password reset email sent via SMTP to %s", to_email)
            return
    except Exception as exc:
        logger.error(
            "Failed to send reset email to %s via %s (%s) — falling back to log. "
            "To fix: request SES production access or verify recipient in SES console.",
            to_email,
            backend,
            exc,
        )

    # Log backend (or fallback)
    logger.warning("PASSWORD RESET LINK for %s: %s", to_email, reset_url)


def _build_invitation_message(to_email: str, org_name: str, invite_url: str, role: str) -> tuple[str, str]:
    """Return (plain_text, html) for an invitation email."""
    plain = f"""\
You've been invited to join {org_name} on GoUsers as a {role}.

Click the link below to create your account and accept the invitation:

{invite_url}

If you did not expect this invitation, you can safely ignore this email.
"""
    html = f"""\
<html><body style="font-family:sans-serif;color:#1a1d27;background:#f5f5f5;padding:32px">
  <div style="max-width:480px;margin:auto;background:#fff;border-radius:8px;padding:32px;border:1px solid #e5e7eb">
    <h2 style="margin-top:0">You've been invited to {org_name}</h2>
    <p>You've been invited to join <strong>{org_name}</strong> on GoUsers as a <strong>{role}</strong>.</p>
    <p>Click the button below to create your account and get started.</p>
    <p style="text-align:center;margin:32px 0">
      <a href="{invite_url}"
         style="background:#5865f2;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600">
        Accept invitation
      </a>
    </p>
    <p style="color:#6b7280;font-size:13px">
      If you didn't expect this invitation you can safely ignore this email.
    </p>
  </div>
</body></html>
"""
    return plain, html


async def _send_invitation_ses(to_email: str, org_name: str, invite_url: str, role: str) -> None:
    import boto3
    plain, html = _build_invitation_message(to_email, org_name, invite_url, role)

    def _do_send():
        client = boto3.client("ses", region_name=settings.SES_REGION)
        client.send_email(
            Source=settings.SES_FROM_EMAIL,
            Destination={"ToAddresses": [to_email]},
            Message={
                "Subject": {"Data": f"You're invited to join {org_name} on GoUsers", "Charset": "UTF-8"},
                "Body": {
                    "Text": {"Data": plain, "Charset": "UTF-8"},
                    "Html": {"Data": html, "Charset": "UTF-8"},
                },
            },
        )

    loop = asyncio.get_running_loop()
    await loop.run_in_executor(None, _do_send)


async def _send_invitation_smtp(to_email: str, org_name: str, invite_url: str, role: str) -> None:
    import aiosmtplib
    plain, html = _build_invitation_message(to_email, org_name, invite_url, role)

    msg = MIMEMultipart("alternative")
    msg["Subject"] = f"You're invited to join {org_name} on GoUsers"
    msg["From"] = settings.SMTP_FROM
    msg["To"] = to_email
    msg.attach(MIMEText(plain, "plain"))
    msg.attach(MIMEText(html, "html"))

    await aiosmtplib.send(
        msg,
        hostname=settings.SMTP_HOST,
        port=settings.SMTP_PORT,
        username=settings.SMTP_USER or None,
        password=settings.SMTP_PASSWORD or None,
        start_tls=True,
    )


async def send_invitation_email(to_email: str, org_name: str, invite_url: str, role: str) -> None:
    """Send an invitation email using the configured backend.

    Falls back to logging the link if the configured backend fails (e.g. SES sandbox mode).
    """
    backend = settings.EMAIL_BACKEND.lower()

    try:
        if backend == "ses":
            await _send_invitation_ses(to_email, org_name, invite_url, role)
            logger.info("Invitation email sent via SES to %s", to_email)
            return
        elif backend == "smtp":
            if not settings.SMTP_HOST:
                raise ValueError("EMAIL_BACKEND=smtp but SMTP_HOST is not configured")
            await _send_invitation_smtp(to_email, org_name, invite_url, role)
            logger.info("Invitation email sent via SMTP to %s", to_email)
            return
    except Exception as exc:
        logger.error(
            "Failed to send invitation email to %s via %s (%s) — falling back to log. "
            "If SES: verify recipient or request production access. Link: %s",
            to_email,
            backend,
            exc,
            invite_url,
        )

    # Log backend (or fallback)
    logger.warning(
        "INVITATION LINK for %s (%s role in %s): %s",
        to_email,
        role,
        org_name,
        invite_url,
    )
