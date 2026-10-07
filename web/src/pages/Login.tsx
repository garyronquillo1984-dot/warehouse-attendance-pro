import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { friendlyError } from '../lib/errors';
import { AuthLayout, Field, Notice } from '../components/ui';

export default function Login() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (err) return setError(friendlyError(err));
    nav(params.get('next') || '/', { replace: true });
  }

  return (
    <AuthLayout>
      <div className="stack">
        <h1>Sign in</h1>
        <p className="muted">Track today’s attendance by shift.</p>
      </div>
      {params.get('reset') === '1' && <Notice kind="ok">Password updated. Sign in with your new password.</Notice>}
      {error && <Notice kind="error">{error}</Notice>}
      <form className="stack" onSubmit={submit} noValidate>
        <Field label="Email" name="email" type="email" autoComplete="email" required
               value={email} onChange={e => setEmail(e.target.value)} />
        <Field label="Password" name="password" type="password" autoComplete="current-password" required
               value={password} onChange={e => setPassword(e.target.value)} />
        <button className="btn btn-primary btn-block" disabled={busy || !email || !password}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      <div className="stack small">
        <Link to="/forgot-password">Forgot your password?</Link>
        <span className="muted">New here? <Link to="/signup">Create an account</Link> with the email you used to buy.</span>
      </div>
    </AuthLayout>
  );
}
