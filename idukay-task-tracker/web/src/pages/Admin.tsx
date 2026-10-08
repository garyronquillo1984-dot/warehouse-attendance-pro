import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAccount } from '../lib/account';
import { useT } from '../lib/i18n';
import { Empty, Spinner } from '../components/ui';

type Overview = Record<string, unknown> & {
  funnel: Record<string, number>;
  revenue_30d: Record<string, number>;
  signups_by_day: Array<{ day: string; n: number }>;
};

const KPIS = ['total_users', 'new_users_7d', 'active_trials', 'trials_expiring_3d', 'active_subscribers', 'mrr_estimate_usd',
  'conversion_rate', 'cancelled_subscribers', 'payment_failed', 'failed_payments_30d', 'payment_pending', 'expired',
  'unmatched_payments', 'dau', 'wau', 'children', 'tasks', 'tasks_completed'];
const FUNNEL = ['registration', 'trial_started', 'first_child_added', 'first_task_added', 'first_task_completed',
  'onboarding_completed', 'trial_expired', 'checkout_clicked', 'subscription_activated', 'subscription_cancelled'];

// Product owner dashboard. The database refuses this RPC for anyone not in platform_admins,
// and it only ever returns aggregates.
export function AdminPage() {
  const { account } = useAccount();
  const { t } = useT();
  const [data, setData] = useState<Overview | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    if (!account?.is_admin) return;
    supabase.rpc('admin_overview').then(({ data: d, error }) => { if (error) setErr(true); else setData(d as Overview); });
  }, [account?.is_admin]);

  if (!account?.is_admin || err) return <Empty icon="🔒">{t.admin.noAccess}</Empty>;
  if (!data) return <Spinner />;
  const fmt = (k: string, v: unknown) =>
    v === null || v === undefined ? '—' : k === 'conversion_rate' ? `${v}%` : k === 'mrr_estimate_usd' ? `$${Number(v).toFixed(2)}` : String(v);
  const maxFunnel = Math.max(1, ...FUNNEL.map(k => data.funnel[k] ?? 0));
  const maxDay = Math.max(1, ...data.signups_by_day.map(d => d.n));

  return (
    <div className="stack">
      <div className="page-head"><h1>{t.admin.title}</h1><p className="small muted">🔒 {t.admin.privacyNote}</p></div>
      <div className="kpis">
        {KPIS.map(k => <div key={k} className="card kpi" data-testid={`kpi-${k}`}><div className="n">{fmt(k, data[k])}</div><div className="l">{t.admin.labels[k]}</div></div>)}
      </div>
      <div className="card card-pad stack-sm">
        <h3>{t.admin.revenue}</h3>
        {Object.keys(data.revenue_30d).length === 0 ? <p className="muted">—</p>
          : Object.entries(data.revenue_30d).map(([cur, v]) => <div key={cur} className="spread"><span>{cur}</span><strong className="num">{Number(v).toFixed(2)}</strong></div>)}
      </div>
      <div className="card card-pad stack-sm">
        <h3>{t.admin.funnel}</h3>
        {FUNNEL.map(k => (
          <div key={k} className="hbar"><span>{t.admin.events[k]}</span>
            <div className="track"><div style={{ width: `${((data.funnel[k] ?? 0) / maxFunnel) * 100}%` }} /></div>
            <strong className="num" style={{ textAlign: 'right' }}>{data.funnel[k] ?? 0}</strong></div>
        ))}
      </div>
      <div className="card card-pad stack-sm">
        <h3>{t.admin.signups}</h3>
        <div className="vbars" aria-label={t.admin.signups}>
          {data.signups_by_day.map(d => <div key={d.day} title={`${d.day}: ${d.n}`} style={{ height: `${(d.n / maxDay) * 100}%` }} />)}
        </div>
      </div>
    </div>
  );
}
