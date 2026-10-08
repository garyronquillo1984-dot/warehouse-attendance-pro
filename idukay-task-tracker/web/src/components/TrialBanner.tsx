import { Link } from 'react-router-dom';
import { useAccount } from '../lib/account';
import { useT } from '../lib/i18n';
import { daysLeft } from '../lib/dates';

// "Free Trial: X days remaining" + the matching nudge (7 → enjoy, 3 → ends in 3 days, 1 → tomorrow).
export function TrialBanner() {
  const { account } = useAccount();
  const { t } = useT();
  if (!account || account.access !== 'trial') return null;
  const n = daysLeft(account.trial_ends_at);
  const hoursLeft = account.trial_ends_at ? (new Date(account.trial_ends_at).getTime() - Date.now()) / 36e5 : 0;
  const msg = hoursLeft <= 24 && n <= 1 ? (new Date(account.trial_ends_at!).toDateString() === new Date().toDateString() ? t.trial.endsToday : t.trial.endsTomorrow)
    : n <= 3 ? t.trial.endsIn(n) : t.trial.enjoy;
  const cls = n <= 1 ? 'urgent' : n <= 3 ? 'warn' : '';
  return (
    <Link to="/app/subscription" className={`trial-banner ${cls}`} data-testid="trial-banner">
      <span aria-hidden>⏳</span>
      <span className="grow"><strong>{t.trial.left(n)}</strong><br />{msg}</span>
      <span className="btn small" style={{ pointerEvents: 'none' }}>{t.trial.subscribe}</span>
    </Link>
  );
}
