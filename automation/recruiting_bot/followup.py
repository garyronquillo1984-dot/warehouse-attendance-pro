"""Nudges candidates who started screening but stopped replying.

Rules (to stay helpful, not spammy, and within TCPA quiet hours):
- only leads that texted us first (every lead in this table did)
- only status=screening, not opted out
- at most MAX_NUDGES nudges, spaced FOLLOWUP_AFTER_HOURS apart
- only between SEND_WINDOW_START and SEND_WINDOW_END local time
"""
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from db import now_iso


def in_send_window(cfg, now=None):
    now = now or datetime.now(timezone.utc)
    local = now.astimezone(ZoneInfo(cfg.timezone))
    return cfg.send_window_start <= local.hour < cfg.send_window_end


def due_for_followup(cfg, lead, now=None):
    now = now or datetime.now(timezone.utc)
    if lead.get("opted_out") or lead.get("status") != "screening":
        return False
    if (lead.get("nudges") or 0) >= cfg.max_nudges:
        return False
    last = lead.get("last_outbound_at") or lead.get("created_at")
    if not last:
        return False
    return now - datetime.fromisoformat(last) >= timedelta(hours=cfg.followup_after_hours)


def run_followups(cfg, repo, bot, sender, now=None):
    if not in_send_window(cfg, now):
        return {"sent": 0, "skipped": "outside send window"}
    sent = 0
    for lead in repo.all():
        if not due_for_followup(cfg, lead, now):
            continue
        text = bot.nudge_text(lead)
        sender.send(lead["phone"], text)
        repo.log(lead["phone"], "out", text)
        lead["nudges"] = (lead.get("nudges") or 0) + 1
        lead["last_outbound_at"] = now_iso()
        repo.save(lead)
        sent += 1
    return {"sent": sent}
