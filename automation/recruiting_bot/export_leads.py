"""Exports qualified leads to CSV (import into the Top Tier HR page or SignNow Bulk Invite)."""
import csv
import sys

from config import cfg
from db import build_repo


def main(path="data/qualified_leads.csv"):
    rows = [l for l in build_repo(cfg).all() if l.get("status") == "qualified"]
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["email", "first_name", "last_name", "phone", "language", "source", "qualified_at"])
        for l in rows:
            parts = (l.get("name") or "").split()
            w.writerow([l.get("email"), parts[0] if parts else "", " ".join(parts[1:]),
                        l["phone"], l.get("language"), l.get("source"), l.get("updated_at")])
    print(f"{len(rows)} qualified leads -> {path}")


if __name__ == "__main__":
    main(*sys.argv[1:])
