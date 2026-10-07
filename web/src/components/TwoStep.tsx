import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { friendlyError } from '../lib/errors';
import { Notice } from './ui';

interface Factor { id: string; friendly_name?: string; status: string; created_at: string }

// Two-step sign-in with an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password…).
export default function TwoStep() {
  const [factors, setFactors] = useState<Factor[] | null>(null);
  const [enroll, setEnroll] = useState<{ id: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmOff, setConfirmOff] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.auth.mfa.listFactors();
    setFactors(((data?.totp ?? []) as Factor[]).filter(f => f.status === 'verified'));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function start() {
    setMsg(null); setBusy(true);
    // Clear any half-finished setup first, so the new QR code is the only one.
    const { data: all } = await supabase.auth.mfa.listFactors();
    for (const f of (all?.all ?? []) as Factor[]) if (f.status !== 'verified') await supabase.auth.mfa.unenroll({ factorId: f.id });
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: `Authenticator ${new Date().toISOString().slice(0, 10)}` });
    setBusy(false);
    if (error) return setMsg({ kind: 'error', text: friendlyError(error) });
    setEnroll({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    if (!enroll) return;
    setBusy(true); setMsg(null);
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: enroll.id, code: code.trim() });
    setBusy(false);
    if (error) return setMsg({ kind: 'error', text: friendlyError(error) });
    setEnroll(null); setCode('');
    setMsg({ kind: 'ok', text: 'Two-step sign-in is on. You’ll enter a code from your app when you sign in.' });
    load();
  }

  async function turnOff() {
    setConfirmOff(false);
    for (const f of factors ?? []) {
      const { error } = await supabase.auth.mfa.unenroll({ factorId: f.id });
      if (error) return setMsg({ kind: 'error', text: friendlyError(error) });
    }
    setMsg({ kind: 'ok', text: 'Two-step sign-in is off.' });
    load();
  }

  const on = !!factors?.length;
  return (
    <section className="panel" aria-labelledby="mfa-h">
      <h2 id="mfa-h">Two-step sign-in</h2>
      <p className="muted">{on ? 'On. Signing in asks for a 6-digit code from your authenticator app.'
        : 'Adds a 6-digit code from an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password) when you sign in.'}</p>
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
      {factors && !on && !enroll && <button className="btn btn-primary" style={{ justifySelf: 'start' }} disabled={busy} onClick={start}>Set up two-step sign-in</button>}
      {enroll && (
        <form className="stack" onSubmit={verify}>
          <ol className="steps">
            <li>Open your authenticator app and scan this code.
              <img className="qr" src={enroll.qr} alt="QR code for your authenticator app" width={180} height={180} />
              <span className="small muted">Can’t scan? Enter this key: <code className="mono">{enroll.secret}</code></span>
            </li>
            <li>Type the 6-digit code the app shows.</li>
          </ol>
          <div className="field" style={{ maxWidth: 200 }}>
            <label htmlFor="mfa-code">Code</label>
            <input id="mfa-code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6}
                   value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} />
          </div>
          <div className="row">
            <button className="btn btn-primary" disabled={busy || code.length !== 6}>{busy ? 'Checking…' : 'Turn on'}</button>
            <button type="button" className="btn btn-ghost" onClick={() => setEnroll(null)}>Cancel</button>
          </div>
        </form>
      )}
      {on && !confirmOff && <button className="btn btn-ghost" style={{ justifySelf: 'start' }} onClick={() => setConfirmOff(true)}>Turn off</button>}
      {on && confirmOff && (
        <div className="row">
          <span>Turn off two-step sign-in?</span>
          <button className="btn btn-primary" onClick={turnOff}>Yes, turn off</button>
          <button className="btn btn-ghost" onClick={() => setConfirmOff(false)}>Keep it on</button>
        </div>
      )}
    </section>
  );
}

// Shown after a password sign-in when the account has two-step sign-in on.
export function TwoStepChallenge({ onDone }: { onDone: () => void }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    const { data } = await supabase.auth.mfa.listFactors();
    const factor = (data?.totp ?? []).find(f => f.status === 'verified');
    if (!factor) { setBusy(false); return onDone(); }
    const { error: err } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: code.trim() });
    setBusy(false);
    if (err) return setError(friendlyError(err));
    onDone();
  }

  return (
    <form className="stack" onSubmit={submit}>
      <div className="stack" style={{ gap: 6 }}>
        <h1>Enter your code</h1>
        <p className="muted">Open your authenticator app and type the 6-digit code for Warehouse Attendance Pro.</p>
      </div>
      {error && <Notice kind="error">{error}</Notice>}
      <div className="field">
        <label htmlFor="challenge-code">Code</label>
        <input id="challenge-code" inputMode="numeric" autoComplete="one-time-code" autoFocus maxLength={6}
               value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} />
      </div>
      <button className="btn btn-primary btn-block" disabled={busy || code.length !== 6}>{busy ? 'Checking…' : 'Continue'}</button>
      <button type="button" className="btn-link" onClick={() => supabase.auth.signOut()}>Sign out</button>
    </form>
  );
}
