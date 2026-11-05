"""Twilio SMS webhook. Twilio POSTs every incoming text to /sms.

Run locally:  python app.py   (then expose it with a tunnel, see README)
Production:   gunicorn -w 1 -b 0.0.0.0:$PORT app:app
"""
import logging

from flask import Flask, Response, abort, request

from bot import ScreeningBot
from config import cfg
from db import build_repo
from interpreter import build_interpreter
from sms_sender import SmsSender, alert_text

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("app")

app = Flask(__name__)
repo = build_repo(cfg)
bot = ScreeningBot(repo, build_interpreter(cfg), apply_link=cfg.apply_link)
sender = SmsSender(cfg)


def _valid_twilio_request():
    """Reject requests that weren't signed by Twilio with your auth token."""
    if cfg.dry_run and not cfg.twilio_token:
        return True  # local testing without Twilio
    from twilio.request_validator import RequestValidator
    url = f"{cfg.public_base_url}{request.path}" if cfg.public_base_url else request.url
    return RequestValidator(cfg.twilio_token).validate(
        url, request.form.to_dict(), request.headers.get("X-Twilio-Signature", ""))


@app.post("/sms")
def sms():
    if not _valid_twilio_request():
        abort(403)
    phone = request.form.get("From", "")
    body = request.form.get("Body", "")
    if not phone:
        abort(400)
    replies, events = bot.handle_inbound(phone, body)

    for ev in events:
        text = alert_text(ev)
        if text and cfg.gary_phone:
            try:
                sender.send(cfg.gary_phone, text)
            except Exception:  # an alert failure must not break the candidate's reply
                log.exception("Could not alert Gary")
        log.info("event=%s phone=%s", ev["type"], phone)

    from twilio.twiml.messaging_response import MessagingResponse
    twiml = MessagingResponse()
    for r in replies:
        twiml.message(r)
    return Response(str(twiml), mimetype="application/xml")


@app.get("/health")
def health():
    return {"ok": True}


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=False)
