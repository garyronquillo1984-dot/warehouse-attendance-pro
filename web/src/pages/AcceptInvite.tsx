import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { useOrg } from '../lib/org';
import { pendingInvite } from '../lib/setup';
import { friendlyError } from '../lib/errors';
import { AuthLayout, Loading, Notice } from '../components/ui';

export default function AcceptInvite() {
  const [params] = useSearchParams();
  const token = params.get('token') || pendingInvite.get();
  const { session, loading } = useAuth();
  const { refresh, select } = useOrg();
  const nav = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loading || !token) return;
    if (!session) { pendingInvite.set(token); return; }
    (async () => {
      const { data, error: err } = await supabase.rpc('accept_invitation', { token });
      pendingInvite.clear();
      if (err) return setError(friendlyError(err));
      await refresh();
      if (data) select(data as string);
      nav('/', { replace: true });
    })();
  }, [loading, session, token]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!token) return <AuthLayout><h1>Invitation link incomplete</h1><p>Open the link exactly as it appears in your email.</p></AuthLayout>;
  if (loading) return <Loading />;

  if (!session) {
    return (
      <AuthLayout>
        <div className="stack">
          <h1>You’ve been invited</h1>
          <p>Sign in or create an account with the email the invitation was sent to. You’ll join the company right after.</p>
        </div>
        <Link className="btn btn-primary btn-block" to="/signup">Create an account</Link>
        <Link className="btn btn-ghost btn-block" to="/login?next=/invite">I already have an account</Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      {error ? (
        <>
          <Notice kind="error">{error}</Notice>
          <Link className="btn btn-ghost" to="/">Continue</Link>
        </>
      ) : <Loading label="Joining the company…" />}
    </AuthLayout>
  );
}
