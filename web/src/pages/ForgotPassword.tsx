import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { supabase, appUrl } from '../lib/supabase';
import { friendlyError } from '../lib/errors';
import { AuthLayout, Field, Notice } from '../components/ui';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: appUrl('/reset-password') });
    setBusy(false);
    if (err) return setError(friendlyError(err));
    setSent(true);
  }

  return (
    <AuthLayout>
      <div className="stack">
        <h1>Reset your password</h1>
        <p className="muted">We’ll email you a link to choose a new one.</p>
      </div>
      {sent ? (
        // Same message whether or not the account exists, so the page can't be used to find accounts.
        <Notice kind="ok">If an account exists for {email.trim()}, a reset link is on its way. It works once and expires in 1 hour.</Notice>
      ) : (
        <>
          {error && <Notice kind="error">{error}</Notice>}
          <form className="stack" onSubmit={submit} noValidate>
            <Field label="Email" name="email" type="email" autoComplete="email" required
                   value={email} onChange={e => setEmail(e.target.value)} />
            <button className="btn btn-primary btn-block" disabled={busy || !email}>
              {busy ? 'Sending…' : 'Send reset link'}
            </button>
          </form>
        </>
      )}
      <Link to="/login" className="small">Back to sign in</Link>
    </AuthLayout>
  );
}
