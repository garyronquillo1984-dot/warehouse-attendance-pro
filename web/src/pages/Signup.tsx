import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { supabase, appUrl } from '../lib/supabase';
import { friendlyError } from '../lib/errors';
import { AuthLayout, Field, Notice } from '../components/ui';

export default function Signup() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const pwError = password && password.length < 10 ? 'Use at least 10 characters.' : null;
  const confirmError = confirm && confirm !== password ? 'Passwords don’t match.' : null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (pwError || confirmError || !password) return;
    setBusy(true); setError(null);
    const { data, error: err } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { full_name: name.trim() }, emailRedirectTo: appUrl('/') },
    });
    setBusy(false);
    if (err) return setError(friendlyError(err));
    // Supabase returns a user with no identities when the email already has an account.
    if (data.user && data.user.identities && data.user.identities.length === 0) {
      return setError(friendlyError('User already registered'));
    }
    setSentTo(email.trim());
  }

  if (sentTo) {
    return (
      <AuthLayout>
        <div className="status-mark go" aria-hidden="true">✓</div>
        <div className="stack">
          <h1>Check your email</h1>
          <p>We sent a confirmation link to <strong>{sentTo}</strong>. Open it on this device to activate your account.</p>
          <p className="muted small">Nothing after a few minutes? Check your spam folder, or <button className="btn-link" onClick={() => setSentTo(null)}>try a different email</button>.</p>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <div className="stack">
        <h1>Create your account</h1>
        <p className="muted">Use the same email you used to buy, so we can find your purchase.</p>
      </div>
      {error && <Notice kind="error">{error}</Notice>}
      <form className="stack" onSubmit={submit} noValidate>
        <Field label="Your name" name="name" autoComplete="name" required maxLength={120}
               value={name} onChange={e => setName(e.target.value)} />
        <Field label="Email" name="email" type="email" autoComplete="email" required
               value={email} onChange={e => setEmail(e.target.value)} />
        <Field label="Password" name="password" type="password" autoComplete="new-password" required
               hint="At least 10 characters." error={pwError}
               value={password} onChange={e => setPassword(e.target.value)} />
        <Field label="Confirm password" name="confirm" type="password" autoComplete="new-password" required
               error={confirmError} value={confirm} onChange={e => setConfirm(e.target.value)} />
        <button className="btn btn-primary btn-block"
                disabled={busy || !name.trim() || !email || !password || !!pwError || confirm !== password}>
          {busy ? 'Creating account…' : 'Create account'}
        </button>
        <p className="small muted">By creating an account you agree to the <Link to="/terms">Terms</Link> and
          the <Link to="/privacy">Privacy Policy</Link>.</p>
      </form>
      <p className="small muted">Already have an account? <Link to="/login">Sign in</Link></p>
    </AuthLayout>
  );
}
