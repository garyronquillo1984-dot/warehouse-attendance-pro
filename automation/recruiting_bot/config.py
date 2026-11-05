"""Settings loaded from .env (see .env.example)."""
import os
from dataclasses import dataclass

try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))
except ImportError:  # python-dotenv is optional for tests
    pass


def _get(name, default=""):
    return os.environ.get(name, default).strip()


@dataclass(frozen=True)
class Config:
    anthropic_key: str = _get("ANTHROPIC_API_KEY")
    claude_model: str = _get("CLAUDE_MODEL", "claude-opus-5-5")
    twilio_sid: str = _get("TWILIO_ACCOUNT_SID")
    twilio_token: str = _get("TWILIO_AUTH_TOKEN")
    twilio_from: str = _get("TWILIO_FROM_NUMBER")
    public_base_url: str = _get("PUBLIC_BASE_URL").rstrip("/")
    gary_phone: str = _get("GARY_NOTIFY_PHONE")
    apply_link: str = _get("APPLY_LINK")
    db_backend: str = _get("DB_BACKEND", "sqlite")
    sqlite_path: str = _get("SQLITE_PATH", os.path.join(os.path.dirname(__file__), "data", "leads.db"))
    supabase_url: str = _get("SUPABASE_URL").rstrip("/")
    supabase_key: str = _get("SUPABASE_SERVICE_KEY")
    timezone: str = _get("TIMEZONE", "America/New_York")
    followup_after_hours: float = float(_get("FOLLOWUP_AFTER_HOURS", "6") or 6)
    max_nudges: int = int(_get("MAX_NUDGES", "2") or 2)
    send_window_start: int = int(_get("SEND_WINDOW_START", "9") or 9)
    send_window_end: int = int(_get("SEND_WINDOW_END", "20") or 20)
    agency_name: str = _get("AGENCY_NAME", "Top Tier HR")
    agency_address: str = _get("AGENCY_MAILING_ADDRESS")
    dry_run: bool = _get("DRY_RUN", "0") == "1"


cfg = Config()
