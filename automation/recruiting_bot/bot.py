"""The screening conversation. Pure logic: no Flask or Twilio here, so it is easy to test.

handle_inbound(phone, body) -> (replies: list[str], events: list[dict])
events tell the caller what to do next, e.g. {"type": "qualified", "lead": {...}}.
"""
from db import new_lead, now_iso
from messages import MISSING, QUESTIONS, t

ANSWER_FIELD = {"lift": "lift", "transport": "transport", "start": "start_week"}


class ScreeningBot:
    def __init__(self, repo, interpreter, apply_link=""):
        self.repo = repo
        self.interp = interpreter
        self.apply_link = apply_link

    def handle_inbound(self, phone, body, source="sms"):
        lead = self.repo.get(phone)
        is_new = lead is None
        if is_new:
            lead = new_lead(phone, source)
        self.repo.log(phone, "in", body)
        lead["last_inbound_at"] = now_iso()
        lead["nudges"] = 0  # they replied, so the follow-up counter resets

        if lead.get("opted_out"):
            # Carriers/Twilio handle START to re-subscribe; we stay silent.
            self.repo.save(lead)
            return [], []

        question = lead["state"] if lead["state"] in QUESTIONS + ["contact"] else "done"
        # A first text is never an answer, but often carries name/email ("Ana Lopez ana@x.com"),
        # so read it as a contact message.
        res = self.interp.interpret("contact" if is_new else question, body)

        if res.get("stop"):
            lead.update(opted_out=True, status="opted_out")
            self.repo.save(lead)
            return [], [{"type": "opted_out", "lead": lead}]

        if is_new:
            lead["language"] = res.get("language") or "en"
        lang = lead["language"]
        # A first text often already has name/email ("John Smith john@x.com"): keep them.
        if res.get("email") and not lead.get("email"):
            lead["email"] = res["email"]
        if res.get("name") and not lead.get("name"):
            lead["name"] = res["name"]

        replies, events = [], []

        if is_new:
            # Their first message is never an answer to question 1: greet and ask it.
            replies += [t(lang, "intro"), t(lang, "lift")]
        elif res.get("wants_human"):
            lead["status"] = "needs_human"
            replies.append(t(lang, "human"))
            events.append({"type": "needs_human", "lead": lead, "text": body})
        elif question in QUESTIONS:
            replies += self._answer_question(lead, question, res, events)
        elif question == "contact":
            replies += self._collect_contact(lead, events)
        else:
            replies.append(t(lang, "done"))

        lead["last_outbound_at"] = now_iso() if replies else lead.get("last_outbound_at")
        self.repo.save(lead)
        for r in replies:
            self.repo.log(phone, "out", r)
        return replies, events

    def _answer_question(self, lead, question, res, events):
        lang = lead["language"]
        if res["answer"] == "unclear":
            return [t(lang, "unclear"), t(lang, question)]
        if res["answer"] == "no":
            lead[ANSWER_FIELD[question]] = False
            lead.update(state="done", status="not_now")
            events.append({"type": "not_now", "lead": lead, "reason": question})
            return [t(lang, "not_now", reason=t(lang, f"reason_{question}"))]
        lead[ANSWER_FIELD[question]] = True
        nxt = QUESTIONS.index(question) + 1
        if nxt < len(QUESTIONS):
            lead["state"] = QUESTIONS[nxt]
            return [t(lang, QUESTIONS[nxt])]
        lead["state"] = "contact"
        if lead.get("name") and lead.get("email"):
            return self._collect_contact(lead, events)
        return [t(lang, "contact")]

    def _collect_contact(self, lead, events):
        lang = lead["language"]
        missing = [k for k in ("name", "email") if not lead.get(k)]
        if missing:
            key = "both" if len(missing) == 2 else missing[0]
            return [t(lang, "contact_missing", missing=MISSING[lang][key])]
        lead.update(state="done", status="qualified")
        events.append({"type": "qualified", "lead": lead})
        first = lead["name"].split()[0]
        if self.apply_link:
            return [t(lang, "qualified_link", name=first, link=self.apply_link)]
        return [t(lang, "qualified_email", name=first, email=lead["email"])]

    def nudge_text(self, lead):
        """Follow-up text for a lead who stopped answering (used by followup.py)."""
        lang = lead["language"]
        key = lead["state"] if lead["state"] in QUESTIONS else "contact"
        return t(lang, "nudge", question=t(lang, key))
