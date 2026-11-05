"""Builds an EMAIL outreach list (CSV for Smartlead, or any email tool) from a contact export.

Input: a CSV exported from Prospeo, Crustdata, ZipRecruiter, a job fair sheet, etc.
It just needs columns (any case): name / first_name, last_name, email, title, city, state.

Why email only (no SMS): texting people who never gave you their number, from a
bought or scraped list, is "telemarketing without prior express consent" under the
TCPA (fines of $500-$1,500 per message). Cold email is allowed under CAN-SPAM if every
email has a real postal address and a working opt-out. This script enforces both.

Usage:
  python sourcing/build_email_outreach.py contacts.csv
  -> data/outreach_smartlead.csv (import into Smartlead) + uses data/suppression.csv
"""
import csv
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from config import cfg  # noqa: E402

TITLE_RE = re.compile(r"warehouse|picker|packer|packing|material handler|forklift|fulfil|order selector|shipping|receiving|logistics associate", re.I)
EMAIL_RE = re.compile(r"^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$")
# Cities within ~30 miles of Florence, KY. Edit as needed.
NEARBY = {"florence", "union", "burlington", "hebron", "erlanger", "independence", "covington",
          "newport", "fort mitchell", "fort wright", "crescent springs", "walton", "elsmere",
          "edgewood", "villa hills", "alexandria", "cold spring", "highland heights", "cincinnati",
          "norwood", "sharonville", "fairfield", "hamilton", "west chester", "lawrenceburg", "aurora",
          "harrison", "cheviot", "mason", "blue ash", "dry ridge", "williamstown"}
MAX_PER_DAY = 50  # keep volume low: new domains get flagged as spam above this

SUBJECT = "Warehouse Packing jobs in Florence, KY - $17/hr, day shift"
BODY = """Hi {first_name},

I'm Gary with {agency}. We're hiring full-time Warehouse Packing Associates in Florence, KY at $17/hr:
- 4 days x 10 hrs (7:00 AM-5:30 PM) with 3 days off every week, or
- Tuesday-Saturday, 7:00 AM-3:30 PM (off Sunday & Monday)

Must be able to lift up to 30 lbs. Interested? Reply to this email or call/text me at (614) 732-3986.

Gary Ronquillo
Onsite Representative | {agency}

{address}
If you'd rather not hear from us, reply "unsubscribe" and we'll remove you."""


def col(row, *names):
    low = {k.lower().strip(): (v or "").strip() for k, v in row.items()}
    for n in names:
        if low.get(n):
            return low[n]
    return ""


def main(src, out="data/outreach_smartlead.csv", suppression="data/suppression.csv"):
    if not cfg.agency_address:
        raise SystemExit("Set AGENCY_MAILING_ADDRESS in .env first (CAN-SPAM requires a real postal address).")
    blocked = set()
    if os.path.exists(suppression):
        with open(suppression, encoding="utf-8") as f:
            blocked = {r[0].strip().lower() for r in csv.reader(f) if r}
    seen, rows = set(), []
    with open(src, newline="", encoding="utf-8-sig") as f:
        for r in csv.DictReader(f):
            email = col(r, "email", "work_email", "personal_email").lower()
            title = col(r, "title", "job_title", "headline")
            city = col(r, "city", "location").lower()
            if not EMAIL_RE.match(email) or email in blocked or email in seen:
                continue
            if title and not TITLE_RE.search(title):
                continue
            if city and not any(c in city for c in NEARBY):
                continue
            name = col(r, "first_name") or col(r, "name", "full_name").split(" ")[0] or "there"
            seen.add(email)
            rows.append({"email": email, "first_name": name.capitalize(), "last_name": col(r, "last_name"),
                         "subject": SUBJECT,
                         "body": BODY.format(first_name=name.capitalize(), agency=cfg.agency_name,
                                             address=cfg.agency_address)})
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["email", "first_name", "last_name", "subject", "body"])
        w.writeheader()
        w.writerows(rows)
    print(f"{len(rows)} contacts -> {out}. Send at most {MAX_PER_DAY}/day. "
          f"Add every 'unsubscribe' reply to {suppression}.")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    main(*sys.argv[1:])
