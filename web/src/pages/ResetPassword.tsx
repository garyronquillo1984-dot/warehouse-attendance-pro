import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { friendlyError } from '../lib/errors';
import { AuthLayout, Field, Loading, Notice } from '../components/ui';

export default function ResetPassword() {
  const { session, loading, clearRecovering } = useAuth();
  const nav = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (loading) return <Loading />;
  if (!session) {
    return (
      <AuthLayout>
        <h1>This link has expired</h1>
        <p>Reset links work once and expire after 1 hour.</p>
        <Link className="btn btn-primary btn-block" to="/forgot-password">Send a new link</Link>
      </AuthLayout>
    );
  }

  const pwError = password && password.length < 10 ? 'Use at least 10 characters.' : null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (pwError || password !== confirm) return;
    setBusy(true); setError(null);
    const { error: err } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (err) return setError(friendlyError(err));
    clearRecovering();
    await supabase.auth.signOut();
    nav('/login?reset=1', { replace: true });
  }

  return (
    <AuthLayout>
      <h1>Choose a new password</h1>
      {error && <Notice kind="error">{error}</Notice>}
      <form className="stack" onSubmit={submit} noValidate>
        <Field label="New password" name="password" type="password" autoComplete="new-password" required
               hint="At least 10 characters." error={pwError} value={password} onChange={e => setPassword(e.target.value)} />
        <Field label="Confirm new password" name="confirm" type="password" autoComplete="new-password" required
               error={confirm && confirm !== password ? 'Passwords don’t match.' : null}
               value={confirm} onChange={e => setConfirm(e.target.value)} />
        <button className="btn btn-primary btn-block" disabled={busy || !password || !!pwError || password !== confirm}>
          {busy ? 'Saving…' : 'Save new password'}
        </button>
      </form>
    </AuthLayout>
  );
}
