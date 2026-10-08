import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAccount } from '../lib/account';
import { useT } from '../lib/i18n';
import { PRICE_LABEL } from '../lib/config';
import { useCheckout } from '../pages/Subscription';

// Shown instead of the app when access is locked. Data is kept and still exportable.
export function Paywall() {
  const { account, refresh } = useAccount();
  const { t } = useT();
  const { checkout, verify, busy, message } = useCheckout();
  const [checked, setChecked] = useState(false);
  const wasPaid = account?.status && account.status !== 'TRIAL';
  return (
    <div className="paywall card card-pad" data-testid="paywall">
      <div style={{ fontSize: 40 }} aria-hidden>🔒</div>
      <h1>{wasPaid ? t.paywall.subEnded : t.paywall.trialEnded}</h1>
      <p className="muted">{t.paywall.keep}</p>
      <div className="price">{PRICE_LABEL}<small> USD {t.landing.pricePer}</small></div>
      <p className="muted">{t.paywall.continueFor}</p>
      <button type="button" className="btn big block" onClick={checkout} disabled={busy}>{t.paywall.cta}</button>
      <button type="button" className="btn secondary block" disabled={busy} onClick={async () => { await verify(); await refresh(); setChecked(true); }}>
        {t.paywall.already}
      </button>
      {message && <div className={checked ? 'form-ok' : 'form-error'} role="status">{message}</div>}
      <p className="small muted">{t.sub.secure}</p>
      <div className="row" style={{ justifyContent: 'center' }}>
        <Link to="/app/settings" className="btn ghost small">{t.paywall.manage}</Link>
      </div>
    </div>
  );
}
