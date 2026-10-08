import { useState } from 'react';
import { useAccount } from '../lib/account';
import { useT } from '../lib/i18n';
import { billing, HOTMART_MANAGE_URL, type BillingReply } from '../lib/billing';
import { daysLeft } from '../lib/dates';
import { PRICE_LABEL } from '../lib/config';
import { TrialBanner } from '../components/TrialBanner';

// Checkout / verify actions shared by this page and the paywall. A reply of
// "not_configured" is shown as such: we never pretend a payment happened.
export function useCheckout() {
  const { t } = useT();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const explain = (r: BillingReply) =>
    r.reason === 'not_configured' ? t.sub.notConfigured
    : r.reason === 'no_subscription' ? t.sub.noSubscription
    : t.sub.providerError;

  const checkout = async () => {
    setBusy(true); setMessage(null);
    const r = await billing('checkout');
    if (r.ok && r.url) { setMessage(t.sub.redirecting); window.location.assign(r.url); return; }
    setMessage(explain(r)); setBusy(false);
  };
  const verify = async () => {
    setBusy(true); setMessage(null);
    const r = await billing('verify');
    setMessage(r.ok ? null : explain(r)); setBusy(false);
    return r;
  };
  const cancel = async () => {
    setBusy(true); setMessage(null);
    const r = await billing('cancel');
    setBusy(false);
    if (r.ok) setMessage(t.sub.cancelRequested);
    else if (r.reason === 'not_configured') { setMessage(t.sub.notConfigured); window.open(HOTMART_MANAGE_URL, '_blank', 'noopener'); }
    else setMessage(explain(r));
  };
  return { busy, message, checkout, verify, cancel };
}

export function SubscriptionPage() {
  const { account, refresh } = useAccount();
  const { t } = useT();
  const { busy, message, checkout, verify, cancel } = useCheckout();
  if (!account) return null;
  const fmt = (iso: string | null) => iso ? new Intl.DateTimeFormat(t.locale, { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso)) : '—';
  const graceEnd = account.current_period_end ? new Date(new Date(account.current_period_end).getTime() + account.grace_days * 864e5).toISOString() : null;
  const status = account.status ?? 'TRIAL';
  const paidActive = account.access === 'active' || account.access === 'grace';

  let line = '';
  if (status === 'TRIAL' && account.access === 'trial') line = t.sub.trialUntil(fmt(account.trial_ends_at));
  else if (status === 'ACTIVE' && paidActive) line = t.sub.activeUntil(fmt(account.current_period_end));
  else if (status === 'CANCELLED' && paidActive) line = t.sub.cancelledUntil(fmt(account.current_period_end));
  else if (status === 'PAYMENT_FAILED' && paidActive) line = t.sub.failed(fmt(graceEnd));
  else if (status === 'PAYMENT_PENDING') line = t.sub.pending;
  else if (account.access === 'locked') line = t.sub.expired;
  else if (account.access === 'trial') line = t.sub.trialUntil(fmt(account.trial_ends_at));

  const canSubscribe = !(status === 'ACTIVE' && paidActive) && status !== 'PAYMENT_FAILED';
  const pillCls = account.access === 'locked' ? 'overdue' : status === 'ACTIVE' ? 'done' : status === 'PAYMENT_FAILED' ? 'today' : 'scheduled';

  return (
    <div className="stack">
      <h1>{t.sub.title}</h1>
      <TrialBanner />
      <div className="card card-pad stack" data-testid="subscription-card">
        <div className="spread"><span className="eyebrow">{t.sub.status}</span>
          <span className={`pill ${pillCls}`} data-testid="sub-status">{t.sub.states[status] ?? status}{account.access === 'trial' && status === 'TRIAL' ? ` · ${daysLeft(account.trial_ends_at)}d` : ''}</span></div>
        <p>{line}</p>
        <div className="spread" style={{ alignItems: 'baseline' }}>
          <div><h3>{t.sub.plan}</h3><span className="muted small">{t.sub.price}</span></div>
          <div style={{ fontFamily: 'var(--font-head)', fontSize: 30, fontWeight: 700 }}>{PRICE_LABEL}</div>
        </div>
        <ul className="small muted" style={{ margin: 0, paddingLeft: 18 }}>{t.landing.priceItems.map(x => <li key={x}>{x}</li>)}</ul>
        {canSubscribe && <button type="button" className="btn big" disabled={busy} onClick={checkout}>{t.sub.continue}</button>}
        {status === 'PAYMENT_FAILED' && <a className="btn big" href={HOTMART_MANAGE_URL} target="_blank" rel="noopener noreferrer">{t.sub.manageHotmart}</a>}
        <button type="button" className="btn secondary" disabled={busy} onClick={async () => { await verify(); await refresh(); }}>{busy ? t.sub.verifying : t.sub.verify}</button>
        {(status === 'ACTIVE' || status === 'PAYMENT_FAILED') && paidActive && (
          <button type="button" className="btn ghost" disabled={busy} onClick={() => { if (confirm(t.sub.cancelConfirm)) void cancel(); }}>{t.sub.cancel}</button>
        )}
        {message && <div className="form-error" role="status" data-testid="billing-message">{message}</div>}
        <p className="small faint">🔒 {t.sub.secure}</p>
      </div>
    </div>
  );
}
