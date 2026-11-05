"""Lead storage. SQLite (default) or Supabase (Postgres via its REST API).

A lead is one phone number. Fields:
  phone, name, email, language, state, status, lift, transport, start_week,
  nudges, opted_out, source, created_at, updated_at, last_inbound_at, last_outbound_at
state  = which question we're waiting on: lift | transport | start | contact | done
status = screening | qualified | not_now | needs_human | opted_out
"""
import json
import sqlite3
from datetime import datetime, timezone

FIELDS = ["phone", "name", "email", "language", "state", "status", "lift", "transport",
          "start_week", "nudges", "opted_out", "source", "created_at", "updated_at",
          "last_inbound_at", "last_outbound_at"]


def now_iso():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def new_lead(phone, source="sms"):
    ts = now_iso()
    return {"phone": phone, "name": None, "email": None, "language": "en", "state": "lift",
            "status": "screening", "lift": None, "transport": None, "start_week": None,
            "nudges": 0, "opted_out": False, "source": source, "created_at": ts,
            "updated_at": ts, "last_inbound_at": None, "last_outbound_at": None}


class SQLiteRepo:
    def __init__(self, path):
        self.conn = sqlite3.connect(path, check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self.conn.executescript("""
            CREATE TABLE IF NOT EXISTS sms_leads (
              phone TEXT PRIMARY KEY, name TEXT, email TEXT, language TEXT, state TEXT,
              status TEXT, lift INTEGER, transport INTEGER, start_week INTEGER,
              nudges INTEGER DEFAULT 0, opted_out INTEGER DEFAULT 0, source TEXT,
              created_at TEXT, updated_at TEXT, last_inbound_at TEXT, last_outbound_at TEXT);
            CREATE TABLE IF NOT EXISTS sms_messages (
              id INTEGER PRIMARY KEY AUTOINCREMENT, phone TEXT, direction TEXT,
              body TEXT, created_at TEXT);
        """)

    def get(self, phone):
        row = self.conn.execute("SELECT * FROM sms_leads WHERE phone=?", (phone,)).fetchone()
        if not row:
            return None
        lead = dict(row)
        lead["opted_out"] = bool(lead["opted_out"])
        for k in ("lift", "transport", "start_week"):
            lead[k] = None if lead[k] is None else bool(lead[k])
        return lead

    def save(self, lead):
        lead["updated_at"] = now_iso()
        vals = [lead.get(f) for f in FIELDS]
        self.conn.execute(
            f"INSERT OR REPLACE INTO sms_leads ({','.join(FIELDS)}) VALUES ({','.join('?' * len(FIELDS))})", vals)
        self.conn.commit()

    def log(self, phone, direction, body):
        self.conn.execute("INSERT INTO sms_messages (phone, direction, body, created_at) VALUES (?,?,?,?)",
                          (phone, direction, body, now_iso()))
        self.conn.commit()

    def all(self):
        return [self.get(r["phone"]) for r in self.conn.execute("SELECT phone FROM sms_leads")]


class SupabaseRepo:
    """Uses the tables in sql/sms_leads.sql through Supabase's REST API (service key)."""

    def __init__(self, url, key):
        import requests
        self.http = requests.Session()
        self.base = f"{url}/rest/v1"
        self.http.headers.update({"apikey": key, "Authorization": f"Bearer {key}",
                                  "Content-Type": "application/json"})

    def get(self, phone):
        r = self.http.get(f"{self.base}/sms_leads", params={"phone": f"eq.{phone}", "select": "*"}, timeout=15)
        r.raise_for_status()
        rows = r.json()
        return rows[0] if rows else None

    def save(self, lead):
        lead["updated_at"] = now_iso()
        r = self.http.post(f"{self.base}/sms_leads", data=json.dumps({f: lead.get(f) for f in FIELDS}),
                           headers={"Prefer": "resolution=merge-duplicates,return=minimal"}, timeout=15)
        r.raise_for_status()

    def log(self, phone, direction, body):
        r = self.http.post(f"{self.base}/sms_messages",
                           data=json.dumps({"phone": phone, "direction": direction, "body": body}),
                           headers={"Prefer": "return=minimal"}, timeout=15)
        r.raise_for_status()

    def all(self):
        r = self.http.get(f"{self.base}/sms_leads", params={"select": "*"}, timeout=30)
        r.raise_for_status()
        return r.json()


def build_repo(cfg):
    if cfg.db_backend == "supabase":
        if not (cfg.supabase_url and cfg.supabase_key):
            raise SystemExit("DB_BACKEND=supabase needs SUPABASE_URL and SUPABASE_SERVICE_KEY in .env")
        return SupabaseRepo(cfg.supabase_url, cfg.supabase_key)
    import os
    os.makedirs(os.path.dirname(cfg.sqlite_path) or ".", exist_ok=True)
    return SQLiteRepo(cfg.sqlite_path)
