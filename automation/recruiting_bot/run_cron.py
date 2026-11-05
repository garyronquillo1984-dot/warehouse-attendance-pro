"""Entry point for the scheduled job (cron every 6 hours).

  0 */6 * * *  cd /path/to/recruiting_bot && ./venv/bin/python run_cron.py >> data/cron.log 2>&1

Does: follow-ups to silent candidates + a short status summary SMS to Gary.
"""
from collections import Counter

from bot import ScreeningBot
from config import cfg
from db import build_repo
from followup import in_send_window, run_followups
from interpreter import RuleInterpreter
from sms_sender import SmsSender


def main():
    repo = build_repo(cfg)
    bot = ScreeningBot(repo, RuleInterpreter(), apply_link=cfg.apply_link)  # follow-ups need no Claude call
    sender = SmsSender(cfg)
    result = run_followups(cfg, repo, bot, sender)
    counts = Counter(l.get("status") for l in repo.all())
    summary = ("Top Tier HR bot: " + ", ".join(f"{k}={v}" for k, v in sorted(counts.items()))
               + f" | follow-ups sent: {result.get('sent', 0)}")
    print(summary)
    if cfg.gary_phone and in_send_window(cfg):
        sender.send(cfg.gary_phone, summary)


if __name__ == "__main__":
    main()
