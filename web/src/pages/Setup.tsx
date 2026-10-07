import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { useOrg, canManage } from '../lib/org';
import { useSetupStatus, SUPPORT_EMAIL } from '../lib/setup';
import { friendlyError } from '../lib/errors';
import { browserTimezone, timezoneOptions } from '../lib/time';
import type { Shift } from '../lib/types';
import { Field, Loading, Notice, Stepper } from '../components/ui';
import { ShiftEditor, DEFAULT_SHIFTS, validateShifts } from '../components/ShiftEditor';

const STEPS = ['Account', 'Company', 'Warehouse', 'Shifts', 'Employees', 'Attendance'];

// Onboarding: the step shown is decided by what the company already has,
// so closing the browser halfway and coming back resumes at the right place.
export default function Setup() {
  const { orgs, current, loading: orgsLoading } = useOrg();
  const status = useSetupStatus(current?.organization_id, !!current);
  const [finished, setFinished] = useState(false);

  if (orgsLoading || (current && status.loading)) return <Loading />;

  let step: number;
  if (!orgs.length) step = 1;
  else if (!status.warehouses.length) step = 2;
  else if (!status.shiftCount) step = 3;
  else step = 4;

  if (current && !canManage(current)) return <Navigate to="/" replace />;

  return (
    <main className="auth">
      <div className="auth-panel" style={{ maxWidth: step === 3 ? 760 : 520 }}>
        <Stepper steps={STEPS} current={finished || step === 4 ? 4 : step} />
        {step === 1 && <CompanyStep />}
        {step === 2 && current && <WarehouseStep orgId={current.organization_id} onDone={status.reload} />}
        {step === 3 && current && (
          <ShiftsStep orgId={current.organization_id} warehouseId={status.warehouses[0].id}
                      warehouseName={status.warehouses[0].name} onDone={async () => { await status.reload(); setFinished(true); }} />
        )}
        {step === 4 && <DoneStep />}
      </div>
    </main>
  );
}

function CompanyStep() {
  const { session } = useAuth();
  const { refresh } = useOrg();
  const tz = browserTimezone();
  const [name, setName] = useState('');
  const [timezone, setTimezone] = useState(tz);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noLicense, setNoLicense] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    const { error: err } = await supabase.rpc('claim_license', { org_name: name.trim(), org_timezone: timezone });
    setBusy(false);
    if (err) {
      const msg = friendlyError(err);
      if (msg === 'NO_LICENSE') return setNoLicense(true);
      return setError(msg);
    }
    await refresh();
  }

  if (noLicense) return <NoLicense email={session?.user.email ?? ''} onRetry={() => setNoLicense(false)} />;

  return (
    <>
      <div className="stack">
        <h1>Set up your company</h1>
        <p className="muted">This activates your purchase. You can change these later in Settings.</p>
      </div>
      {error && <Notice kind="error">{error}</Notice>}
      <form className="stack" onSubmit={submit}>
        <Field label="Company name" name="company" required maxLength={120} autoFocus
               hint="As your team knows it, for example “Northgate Logistics”."
               value={name} onChange={e => setName(e.target.value)} />
        <div className="field">
          <label htmlFor="timezone">Time zone</label>
          <select id="timezone" value={timezone} onChange={e => setTimezone(e.target.value)}>
            {timezoneOptions(tz).map(z => <option key={z} value={z}>{z.replace(/_/g, ' ')}</option>)}
          </select>
          <span className="hint">Decides when “today” starts for attendance.</span>
        </div>
        <button className="btn btn-primary btn-block" disabled={busy || !name.trim()}>
          {busy ? 'Activating…' : 'Continue'}
        </button>
      </form>
    </>
  );
}

export function NoLicense({ email, onRetry }: { email: string; onRetry?: () => void }) {
  return (
    <>
      <div className="status-mark wait" aria-hidden="true">?</div>
      <div className="stack">
        <h1>We can’t find a purchase for this email</h1>
        <p>You’re signed in as <strong>{email}</strong>, but there’s no active purchase linked to it.</p>
      </div>
      <ul className="stack" style={{ margin: 0, paddingLeft: 20 }}>
        <li>If you bought with a different email, sign out and create an account with that email.</li>
        <li>If you just bought, wait a minute and try again. Purchases can take a moment to arrive.</li>
        <li>If someone invited you to their company, open the invitation link from your email.</li>
      </ul>
      {SUPPORT_EMAIL && <p className="small">Still stuck? Email <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.</p>}
      <div className="row">
        {onRetry && <button className="btn btn-primary" onClick={onRetry}>Try again</button>}
        <button className="btn btn-ghost" onClick={() => supabase.auth.signOut()}>Sign out</button>
      </div>
    </>
  );
}

function WarehouseStep({ orgId, onDone }: { orgId: string; onDone: () => Promise<void> }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    const { error: err } = await supabase.from('warehouses').insert({ organization_id: orgId, name: name.trim() });
    setBusy(false);
    if (err) return setError(friendlyError(err));
    await onDone();
  }

  return (
    <>
      <div className="stack">
        <h1>Add your warehouse</h1>
        <p className="muted">The site where your team clocks in. Employees and shifts belong to a warehouse.</p>
      </div>
      {error && <Notice kind="error">{error}</Notice>}
      <form className="stack" onSubmit={submit}>
        <Field label="Warehouse name" name="warehouse" required maxLength={120} autoFocus
               hint="For example “DC-1 Columbus” or “Building B”."
               value={name} onChange={e => setName(e.target.value)} />
        <button className="btn btn-primary btn-block" disabled={busy || !name.trim()}>
          {busy ? 'Saving…' : 'Continue'}
        </button>
      </form>
    </>
  );
}

function ShiftsStep({ orgId, warehouseId, warehouseName, onDone }:
  { orgId: string; warehouseId: string; warehouseName: string; onDone: () => Promise<void> }) {
  const [shifts, setShifts] = useState<Shift[]>(DEFAULT_SHIFTS.map(s => ({ ...s })));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const invalid = validateShifts(shifts);
    if (invalid) return setError(invalid);
    setBusy(true); setError(null);
    const rows = shifts.map((s, i) => ({
      organization_id: orgId, warehouse_id: warehouseId, name: s.name.trim(),
      start_time: s.start_time, end_time: s.end_time, days: s.days,
      late_grace_minutes: s.late_grace_minutes, is_active: s.is_active, sort_order: i,
    }));
    const { error: err } = await supabase.from('shifts').insert(rows);
    setBusy(false);
    if (err) return setError(friendlyError(err));
    await onDone();
  }

  return (
    <>
      <div className="stack">
        <h1>Set the shifts for {warehouseName}</h1>
        <p className="muted">We filled in two common shifts. Rename them, change the times, or add more.</p>
      </div>
      {error && <Notice kind="error">{error}</Notice>}
      <form className="stack" onSubmit={submit}>
        {shifts.map((s, i) => (
          <ShiftEditor key={i} index={i} shift={s}
                       onChange={next => setShifts(shifts.map((x, j) => (j === i ? next : x)))}
                       onRemove={shifts.length > 1 ? () => setShifts(shifts.filter((_, j) => j !== i)) : undefined} />
        ))}
        <button type="button" className="btn btn-ghost"
                onClick={() => setShifts([...shifts, { name: `Shift ${shifts.length + 1}`, start_time: '', end_time: '', days: [1, 2, 3, 4, 5], late_grace_minutes: 5, is_active: true }])}>
          Add another shift
        </button>
        <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Saving…' : 'Save shifts'}</button>
      </form>
    </>
  );
}

function DoneStep() {
  const nav = useNavigate();
  useEffect(() => { window.scrollTo(0, 0); }, []);
  return (
    <>
      <div className="status-mark go" aria-hidden="true">✓</div>
      <div className="stack">
        <h1>Your company is ready</h1>
        <p>Company, warehouse and shifts are saved. Next you’ll add your employees and take your first attendance.
           Both arrive in the next updates of the app.</p>
      </div>
      <div className="row">
        <button className="btn btn-primary" onClick={() => nav('/', { replace: true })}>Go to Today</button>
        <Link className="btn btn-ghost" to="/settings">Review settings</Link>
      </div>
    </>
  );
}

