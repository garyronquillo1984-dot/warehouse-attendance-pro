import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { friendlyError } from '../lib/errors';
import { Loading, Notice, Wordmark } from '../components/ui';
import type { LicenseStatus } from '../lib/types';

// Platform owner's panel: companies, licenses and Hotmart deliveries.
// Shows counts and statuses only; there is no way from here to open a customer's employees or attendance.
interface Company { organization_id: string; organization_name: string; created_at: string; license_status: LicenseStatus | null;
  plan_code: string | null; current_period_end: string | null; warehouses: number; users: number; active_employees: number; last_activity: string | null }
interface License { license_id: string; organization_id: string | null; buyer_email: string; status: LicenseStatus; plan_code: string;
  current_period_end: string | null; claimed_at: string | null; updated_at: string }
interface BillingEvent { received_at: string; event_type: string; outcome: string | null; buyer_email: string | null; subscriber_code: string | null; transaction_code: string | null }

const STATUSES: LicenseStatus[] = ['trial', 'active', 'suspended', 'cancelled', 'expired'];
const PLANS = ['starter', 'professional', 'business'];
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—');
const when = (iso: string) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const inDays = (n: number) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

export default function Admin() {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [aal2, setAal2] = useState(false);
  const [companies, setCompanies] = useState<Company[] | null>(null);
  const [licenses, setLicenses] = useState<License[]>([]);
  const [events, setEvents] = useState<BillingEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [c, l, e] = await Promise.all([
      supabase.rpc('admin_overview'), supabase.rpc('admin_list_licenses'), supabase.rpc('admin_billing_events', { max_rows: 50 }),
    ]);
    const err = c.error || l.error || e.error;
    if (err) setError(friendlyError(err));
    setCompanies((c.data ?? []) as Company[]);
    setLicenses((l.data ?? []) as License[]);
    setEvents((e.data ?? []) as BillingEvent[]);
  }, []);

  useEffect(() => {
    (async () => {
      const [{ data: admin }, { data: level }] = await Promise.all([
        supabase.rpc('am_platform_admin'), supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
      ]);
      setIsAdmin(!!admin);
      const two = level?.currentLevel === 'aal2';
      setAal2(two);
      if (admin && two) load();
    })();
  }, [load]);

  if (isAdmin === null) return <Loading />;
  if (!isAdmin) return <Navigate to="/" replace />;

  return (
    <div className="admin">
      <header className="topbar">
        <Wordmark to="/" />
        <span className="admin-badge">Platform admin</span>
        <div className="spacer" />
        <Link className="btn btn-ghost small bar-btn" to="/">Back to the app</Link>
      </header>
      <main className="main stack-lg" style={{ maxWidth: 1200 }}>
        {!aal2 ? (
          <section className="panel">
            <h1>Turn on two-step sign-in first</h1>
            <p>The admin panel only opens after a code from your authenticator app. Set it up in My account, then sign out and sign in again.</p>
            <Link className="btn btn-primary" style={{ justifySelf: 'start' }} to="/account">Go to My account</Link>
          </section>
        ) : !companies ? <Loading /> : (
          <>
            <div className="page-head">
              <h1>Admin</h1>
              <p className="muted">Customers, licenses and Hotmart deliveries. Customer employees and attendance are never shown here.</p>
            </div>
            {error && <Notice kind="error">{error}</Notice>}

            <section className="kpis admin-kpis" aria-label="Totals">
              <div className="kpi kpi-main"><span className="kpi-label">Companies</span><span className="kpi-value">{companies.length}</span></div>
              <div className="kpi"><span className="kpi-label">Active licenses</span><span className="kpi-value">{licenses.filter(l => l.status === 'active' || l.status === 'trial').length}</span></div>
              <div className="kpi"><span className="kpi-label">Not yet claimed</span><span className="kpi-value">{licenses.filter(l => !l.organization_id).length}</span></div>
              <div className="kpi"><span className="kpi-label">Active employees</span><span className="kpi-value">{companies.reduce((n, c) => n + Number(c.active_employees), 0)}</span></div>
            </section>

            <section className="panel flush">
              <h2 className="pad">Companies</h2>
              <div className="table-scroll">
                <table className="report-table">
                  <thead><tr><th>Company</th><th>Since</th><th>License</th><th>Plan</th><th>Paid until</th><th className="num">Warehouses</th><th className="num">Users</th><th className="num">Active employees</th><th>Last attendance</th></tr></thead>
                  <tbody>
                    {companies.map(c => (
                      <tr key={c.organization_id}>
                        <td>{c.organization_name}</td><td>{day(c.created_at)}</td>
                        <td><span className={`lic lic-${c.license_status ?? 'none'}`}>{c.license_status ?? 'none'}</span></td>
                        <td>{c.plan_code ?? '—'}</td><td>{day(c.current_period_end)}</td>
                        <td className="num">{c.warehouses}</td><td className="num">{c.users}</td><td className="num">{c.active_employees}</td>
                        <td>{c.last_activity ? when(c.last_activity) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <LicensePanel licenses={licenses} companies={companies} onChanged={load} />

            <section className="panel flush">
              <div className="pad stack" style={{ gap: 4 }}>
                <h2>Hotmart deliveries</h2>
                <p className="muted small">The last 50 events received by the webhook, newest first.</p>
              </div>
              {!events.length ? <p className="muted pad">No events yet. They appear here as soon as Hotmart sends the first one.</p> : (
                <div className="table-scroll">
                  <table className="report-table">
                    <thead><tr><th>Received</th><th>Event</th><th>Result</th><th>Buyer</th><th>Subscriber</th><th>Transaction</th></tr></thead>
                    <tbody>
                      {events.map((e, i) => (
                        <tr key={i}><td>{when(e.received_at)}</td><td>{e.event_type}</td><td>{e.outcome ?? '—'}</td>
                          <td>{e.buyer_email ?? '—'}</td><td className="mono">{e.subscriber_code ?? '—'}</td><td className="mono">{e.transaction_code ?? '—'}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}

function LicensePanel({ licenses, companies, onChanged }: { licenses: License[]; companies: Company[]; onChanged: () => void }) {
  const [editing, setEditing] = useState<License | 'new' | null>(null);
  const [email, setEmail] = useState('');
  const [plan, setPlan] = useState('professional');
  const [status, setStatus] = useState<LicenseStatus>('trial');
  const [until, setUntil] = useState(inDays(14));
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const companyName = (id: string | null) => (id ? companies.find(c => c.organization_id === id)?.organization_name ?? 'Company' : 'Not claimed yet');

  function open(l: License | 'new') {
    setEditing(l); setMsg(null);
    if (l === 'new') { setEmail(''); setPlan('professional'); setStatus('trial'); setUntil(inDays(14)); }
    else { setEmail(l.buyer_email); setPlan(l.plan_code); setStatus(l.status); setUntil(l.current_period_end?.slice(0, 10) ?? inDays(30)); }
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    const { error } = await supabase.rpc('admin_upsert_license', {
      target_license: editing === 'new' ? null : editing!.license_id, buyer: email.trim(), plan, new_status: status,
      period_end: new Date(until + 'T23:59:59').toISOString(),
    });
    if (error) return setMsg({ kind: 'error', text: friendlyError(error) });
    setMsg({ kind: 'ok', text: editing === 'new' ? `License created. ${email.trim()} can now sign up and set up their company.` : 'License updated.' });
    setEditing(null);
    onChanged();
  }

  return (
    <section className="panel flush">
      <div className="pad report-head">
        <div className="stack" style={{ gap: 4 }}>
          <h2>Licenses</h2>
          <p className="muted small">Hotmart creates these automatically. Add one by hand for a pilot, a free trial or a support fix.</p>
        </div>
        <button className="btn btn-primary" onClick={() => open('new')}>Give a license</button>
      </div>
      {msg && <div className="pad" style={{ paddingTop: 0 }}><Notice kind={msg.kind}>{msg.text}</Notice></div>}
      {editing && (
        <form className="pad stack license-form" onSubmit={save}>
          <h3>{editing === 'new' ? 'New license' : `Edit license for ${editing.buyer_email}`}</h3>
          <div className="filters">
            <div className="field grow">
              <label htmlFor="lic-email">Buyer email</label>
              <input id="lic-email" type="email" required disabled={editing !== 'new'} value={email} onChange={e => setEmail(e.target.value)} />
              {editing === 'new' && <span className="hint">They sign up with this exact email to claim it.</span>}
            </div>
            <div className="field"><label htmlFor="lic-plan">Plan</label>
              <select id="lic-plan" value={plan} onChange={e => setPlan(e.target.value)}>{PLANS.map(p => <option key={p}>{p}</option>)}</select></div>
            <div className="field"><label htmlFor="lic-status">Status</label>
              <select id="lic-status" value={status} onChange={e => setStatus(e.target.value as LicenseStatus)}>{STATUSES.map(s => <option key={s}>{s}</option>)}</select></div>
            <div className="field"><label htmlFor="lic-until">Paid until</label>
              <input id="lic-until" type="date" required value={until} onChange={e => setUntil(e.target.value)} /></div>
          </div>
          <div className="row">
            <button className="btn btn-primary">Save license</button>
            <button type="button" className="btn btn-ghost" onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </form>
      )}
      <div className="table-scroll">
        <table className="report-table">
          <thead><tr><th>Buyer</th><th>Company</th><th>Status</th><th>Plan</th><th>Paid until</th><th>Claimed</th><th></th></tr></thead>
          <tbody>
            {licenses.map(l => (
              <tr key={l.license_id}>
                <td>{l.buyer_email}</td><td>{companyName(l.organization_id)}</td>
                <td><span className={`lic lic-${l.status}`}>{l.status}</span></td><td>{l.plan_code}</td>
                <td>{day(l.current_period_end)}</td><td>{day(l.claimed_at)}</td>
                <td><button className="btn-link" onClick={() => open(l)}>Edit</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
