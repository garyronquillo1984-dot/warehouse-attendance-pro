import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { friendlyError } from '../lib/errors';
import { AuthLayout, Loading, Notice } from '../components/ui';

// Opens a private sandbox company with sample data. No account, no email.
export default function Demo() {
  const { session, loading } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (loading) return <Loading />;
  // Real customers are already in their own company; guests who come back reopen their sandbox.
  if (session && !session.user.is_anonymous) return <Navigate to="/" replace />;

  async function open() {
    setBusy(true); setError(null);
    if (!session) {
      const { error: err } = await supabase.auth.signInAnonymously();
      if (err) {
        setBusy(false);
        return setError(/anonymous/i.test(err.message) ? 'The demo is closed right now. Please try again later.' : friendlyError(err));
      }
    }
    const { error: err } = await supabase.rpc('start_demo');
    if (err) { setBusy(false); return setError(friendlyError(err)); }
    window.location.assign('/');      // full reload so every screen starts with the new company
  }

  return (
    <AuthLayout>
      <div className="stack">
        <h1>Try it with sample data</h1>
        <p>Open a private demo company: a warehouse with two shifts, 48 employees and three weeks of attendance.
          Take today’s attendance, scan a badge, run the reports and download them.</p>
      </div>
      <ul className="stack" style={{ margin: 0, paddingLeft: 20 }}>
        <li>No account or email needed.</li>
        <li>Only you see your demo. It’s erased after 24 hours.</li>
        <li>The names and numbers are made up.</li>
      </ul>
      {error && <Notice kind="error">{error}</Notice>}
      <button className="btn btn-primary btn-block" disabled={busy} onClick={open}>
        {busy ? 'Preparing your demo…' : session ? 'Back to my demo' : 'Open the demo'}
      </button>
      <p className="small muted">Already a customer? <Link to="/login">Sign in</Link>.</p>
    </AuthLayout>
  );
}
