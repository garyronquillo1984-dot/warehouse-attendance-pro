"""Outbound SMS through Twilio (or printed when DRY_RUN=1)."""
import logging

log = logging.getLogger(__name__)


class SmsSender:
    def __init__(self, cfg):
        self.cfg = cfg
        self.client = None
        if not cfg.dry_run:
            if not (cfg.twilio_sid and cfg.twilio_token and cfg.twilio_from):
                raise SystemExit("Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM_NUMBER (or DRY_RUN=1)")
            from twilio.rest import Client
            self.client = Client(cfg.twilio_sid, cfg.twilio_token)

    def send(self, to, body):
        if self.client is None:
            print(f"[DRY_RUN] to {to}: {body}")
            return "dry-run"
        msg = self.client.messages.create(to=to, from_=self.cfg.twilio_from, body=body)
        return msg.sid


def alert_text(event):
    lead = event["lead"]
    who = lead.get("name") or "Unknown name"
    if event["type"] == "qualified":
        return (f"NEW QUALIFIED LEAD: {who} | {lead['phone']} | {lead.get('email')} | "
                f"lang={lead.get('language')}. Send the SignNow packet now.")
    if event["type"] == "needs_human":
        return f"LEAD WANTS TO TALK: {who} | {lead['phone']} wrote: {event.get('text', '')[:200]}"
    return ""
