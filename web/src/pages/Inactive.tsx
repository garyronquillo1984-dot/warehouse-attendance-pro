import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useOrg } from '../lib/org';
import { SUPPORT_EMAIL } from '../lib/setup';
import type { MyLicense } from '../lib/types';
import { AuthLayout } from '../components/ui';

const LABEL: Record<string, string> = {
  suspended: 'Suspended', cancelled: 'Cancelled', expired: 'Expired', trial: 'Trial', active: 'Active',
};

export default function Inactive() {
  const { current, orgs, select } = useOrg();
  const [license, setLicense] = useState<MyLicense | null>(null);

  useEffect(() => {
    if (!current) return;
    supabase.rpc('my_license', { org: current.organization_id }).then(({ data }) => {
      setLicense(((data ?? []) as MyLicense[])[0] ?? null);
    });
  }, [current]);

  const others = orgs.filter(o => o.organization_id !== current?.organization_id && o.can_read);

  return (
    <AuthLayout>
      <div className="status-mark stop" aria-hidden="true">!</div>
      <div className="stack">
        <h1>Your subscription is inactive</h1>
        <p>Please contact support or renew your subscription. Your company’s data is safe and nothing has been deleted.</p>
        {license?.can_read && <p className="muted small">As an owner or admin you keep access to your data for 30 days after the subscription ends, so you can export it.</p>}
      </div>
      <dl className="kv">
        <dt>Company</dt><dd>{current?.name}</dd>
        <dt>Status</dt><dd>{license ? LABEL[license.status] ?? license.status : current?.license_status ?? 'No subscription'}</dd>
        {license?.plan_name && (<><dt>Plan</dt><dd>{license.plan_name}</dd></>)}
      </dl>
      {SUPPORT_EMAIL && <p className="small">Support: <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a></p>}
      {others.length > 0 && (
        <div className="stack">
          <p className="small muted">You also belong to:</p>
          {others.map(o => (
            <button key={o.organization_id} className="btn btn-ghost" onClick={() => select(o.organization_id)}>Open {o.name}</button>
          ))}
        </div>
      )}
      <button className="btn btn-ghost" onClick={() => supabase.auth.signOut()}>Sign out</button>
    </AuthLayout>
  );
}
