import { useEffect, useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { friendlyError } from '../lib/errors';
import { Field, Notice } from '../components/ui';

export default function Account() {
  const { session } = useAuth();
  const uid = session?.user.id;
  const [name, setName] = useState('');
  const [nameMsg, setNameMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [pwMsg, setPwMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!uid) return;
    supabase.from('profiles').select('full_name').eq('user_id', uid).maybeSingle()
      .then(({ data }) => setName(data?.full_name ?? ''));
  }, [uid]);

  async function saveName(e: FormEvent) {
    e.preventDefault();
    if (!uid) return;
    const { error } = await supabase.from('profiles').update({ full_name: name.trim() }).eq('user_id', uid);
    setNameMsg(error ? { kind: 'error', text: friendlyError(error) } : { kind: 'ok', text: 'Name saved.' });
  }

  async function savePassword(e: FormEvent) {
    e.preventDefault();
    if (pw.length < 10 || pw !== pw2) return;
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    setPwMsg(error ? { kind: 'error', text: friendlyError(error) } : { kind: 'ok', text: 'Password changed.' });
    if (!error) { setPw(''); setPw2(''); }
  }

  return (
    <div className="stack-lg">
      <div className="page-head">
        <h1>My account</h1>
        <p className="muted">Signed in as {session?.user.email}</p>
      </div>

      <form className="panel" onSubmit={saveName}>
        <h2>Profile</h2>
        {nameMsg && <Notice kind={nameMsg.kind}>{nameMsg.text}</Notice>}
        <Field label="Your name" name="full_name" maxLength={120} value={name} onChange={e => setName(e.target.value)} />
        <button className="btn btn-primary" style={{ justifySelf: 'start' }}>Save name</button>
      </form>

      <form className="panel" onSubmit={savePassword}>
        <h2>Change password</h2>
        {pwMsg && <Notice kind={pwMsg.kind}>{pwMsg.text}</Notice>}
        <Field label="New password" name="new_password" type="password" autoComplete="new-password"
               hint="At least 10 characters." error={pw && pw.length < 10 ? 'Use at least 10 characters.' : null}
               value={pw} onChange={e => setPw(e.target.value)} />
        <Field label="Confirm new password" name="confirm_password" type="password" autoComplete="new-password"
               error={pw2 && pw2 !== pw ? 'Passwords don’t match.' : null} value={pw2} onChange={e => setPw2(e.target.value)} />
        <button className="btn btn-primary" style={{ justifySelf: 'start' }} disabled={busy || pw.length < 10 || pw !== pw2}>
          {busy ? 'Saving…' : 'Change password'}
        </button>
      </form>

      <section className="panel narrow-only-block">
        <h2>Sign out</h2>
        <p className="muted">Sign out of this phone. Your attendance stays saved.</p>
        <button className="btn btn-ghost" style={{ justifySelf: 'start' }}
                onClick={async () => { await supabase.auth.signOut(); window.location.assign('/login'); }}>Sign out</button>
      </section>
    </div>
  );
}
