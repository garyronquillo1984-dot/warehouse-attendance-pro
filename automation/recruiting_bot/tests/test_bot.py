"""Runs the full screening conversation offline (SQLite in memory + keyword rules).

  python -m unittest discover -s tests -v
"""
import os
import sys
import unittest
from dataclasses import replace
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from bot import ScreeningBot  # noqa: E402
from config import cfg  # noqa: E402
from db import SQLiteRepo  # noqa: E402
from followup import due_for_followup, run_followups  # noqa: E402
from interpreter import RuleInterpreter  # noqa: E402

PHONE = "+18595550101"


class FakeSender:
    def __init__(self):
        self.sent = []

    def send(self, to, body):
        self.sent.append((to, body))


class BotFlowTest(unittest.TestCase):
    def setUp(self):
        self.repo = SQLiteRepo(":memory:")
        self.bot = ScreeningBot(self.repo, RuleInterpreter())

    def say(self, text, phone=PHONE):
        return self.bot.handle_inbound(phone, text)

    def test_qualified_path_english(self):
        r, _ = self.say("JOBS FLORENCE")
        self.assertIn("1/3", r[-1])
        r, _ = self.say("Yes")
        self.assertIn("2/3", r[0])
        r, _ = self.say("yeah I have a car")
        self.assertIn("3/3", r[0])
        r, _ = self.say("yes")
        self.assertIn("full name and email", r[0])
        r, ev = self.say("John Smith john.smith@example.com")
        self.assertEqual(ev[0]["type"], "qualified")
        lead = self.repo.get(PHONE)
        self.assertEqual((lead["name"], lead["email"], lead["status"]),
                         ("John Smith", "john.smith@example.com", "qualified"))
        self.assertIn("john.smith@example.com", r[0])

    def test_spanish_and_contact_in_first_message(self):
        r, _ = self.say("Hola, quiero trabajo. Maria Lopez maria@example.com")
        self.assertIn("libras", r[-1])
        self.say("si")
        self.say("si tengo carro")
        r, ev = self.say("claro")
        self.assertEqual(ev[0]["type"], "qualified")  # name/email were already captured
        self.assertIn("Gracias Maria", r[0])

    def test_no_answer_closes_politely(self):
        self.say("JOBS")
        self.say("yes")
        r, ev = self.say("no, I don't have a ride")
        self.assertEqual(ev[0]["reason"], "transport")
        self.assertEqual(self.repo.get(PHONE)["status"], "not_now")
        self.assertIn("future openings", r[0])

    def test_unclear_reasks(self):
        self.say("JOBS")
        r, _ = self.say("what time is it?")
        self.assertIn("Yes or No", r[0])
        self.assertEqual(self.repo.get(PHONE)["state"], "lift")

    def test_stop_opts_out_and_silences(self):
        self.say("JOBS")
        r, ev = self.say("STOP")
        self.assertEqual(r, [])
        self.assertTrue(self.repo.get(PHONE)["opted_out"])
        r, _ = self.say("yes")
        self.assertEqual(r, [])

    def test_missing_email(self):
        self.say("JOBS")
        for a in ("yes", "yes", "yes"):
            self.say(a)
        r, ev = self.say("Ana Gomez")
        self.assertEqual(ev, [])
        self.assertIn("email", r[0])
        r, ev = self.say("ana.g@example.com")
        self.assertEqual(ev[0]["type"], "qualified")


class FollowupTest(unittest.TestCase):
    def test_followups_respect_limits(self):
        repo = SQLiteRepo(":memory:")
        bot = ScreeningBot(repo, RuleInterpreter())
        bot.handle_inbound(PHONE, "JOBS")
        lead = repo.get(PHONE)
        lead["last_outbound_at"] = (datetime.now(timezone.utc) - timedelta(hours=7)).isoformat()
        repo.save(lead)
        c = replace(cfg, followup_after_hours=6, max_nudges=2, timezone="America/New_York",
                    send_window_start=0, send_window_end=24)
        self.assertTrue(due_for_followup(c, repo.get(PHONE)))
        sender = FakeSender()
        self.assertEqual(run_followups(c, repo, bot, sender)["sent"], 1)
        self.assertIn("1/3", sender.sent[0][1])
        # just nudged -> not due again until 6h pass
        self.assertEqual(run_followups(c, repo, bot, sender)["sent"], 0)
        # quiet hours block everything
        c2 = replace(c, send_window_start=0, send_window_end=0)
        self.assertEqual(run_followups(c2, repo, bot, sender).get("sent"), 0)


if __name__ == "__main__":
    unittest.main()
