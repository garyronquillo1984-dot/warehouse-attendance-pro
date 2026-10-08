import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase, appUrl } from '../lib/supabase';
import { useT } from '../lib/i18n';
import { useAuth } from '../lib/auth';
import { Field } from '../components/ui';
import { BrandMark } from '../components/Icons';

export const COUNTRIES: Array<[string, string]> = [
  ['EC', 'Ecuador'], ['AR', 'Argentina'], ['BO', 'Bolivia'], ['BR', 'Brasil'], ['CL', 'Chile'], ['CO', 'Colombia'],
  ['CR', 'Costa Rica'], ['DO', 'República Dominicana'], ['ES', 'España'], ['GT', 'Guatemala'], ['HN', 'Honduras'],
  ['MX', 'México'], ['NI', 'Nicaragua'], ['PA', 'Panamá'], ['PE', 'Perú'], ['PR', 'Puerto Rico'], ['PY', 'Paraguay'],
  ['SV', 'El Salvador'], ['US', 'United States'], ['UY', 'Uruguay'], ['VE', 'Venezuela'], ['CA', 'Canada'], ['GB', 'United Kingdom'],
];

export function AuthLayout({ children }: { children: ReactNode }) {
  const { t } = useT();
  return (
    <div className="public">
      <header className="public-nav"><Link to="/" className="brand"><BrandMark />{t.common.appName}</Link></header>
      <main className="public-main"><div className="auth-box">{children}</div></main>
    </div>
  );
}

function authError(message: string, t: ReturnType<typeof useT>['t']) {
  const m = message.toLowerCase();
  if (m.includes('already') || m.includes('registered')) return t.auth.exists;
  if (m.includes('password')) return t.auth.weak;
  if (m.includes('rate') || m.includes('too many')) return t.auth.rateLimited;
  if (m.includes('not confirmed')) return t.auth.notConfirmed;
  if (m.includes('invalid login')) return t.auth.badLogin;
  return t.common.error;
}

export function SignupPage() {
  const { t, lang } = useT();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [country, setCountry] = useState('EC');
  const [password, setPassword] = useState('');
  const [kids, setKids] = useState([{ name: '', school: '', grade: '' }]);
  const [accept, setAccept] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const setKid = (i: number, k: 'name' | 'school' | 'grade', v: string) => setKids(ks => ks.map((x, j) => (j === i ? { ...x, [k]: v } : x)));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 10) { setErr(t.auth.weak); return; }
    if (!kids.some(k => k.name.trim())) { setErr(t.auth.needChild); return; }
    if (!accept) { setErr(t.auth.needAccept); return; }
    setBusy(true); setErr(null);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(), password,
      options: {
        emailRedirectTo: appUrl('/welcome'),
        data: {
          full_name: name.trim(), phone: phone.trim(), country, locale: lang,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          children: kids.filter(k => k.name.trim()).map(k => ({ name: k.name.trim(), school: k.school.trim(), grade: k.grade.trim() })),
        },
      },
    });
    setBusy(false);
    if (error) { setErr(authError(error.message, t)); return; }
    // Supabase answers an existing e-mail with a user that has no identities (no leak of who is registered).
    if (data.user && data.user.identities && data.user.identities.length === 0) { setErr(t.auth.exists); return; }
    setSent(true);
  };

  if (sent) return (
    <AuthLayout>
      <div className="card card-pad stack" data-testid="check-email">
        <div style={{ fontSize: 40 }} aria-hidden>📬</div>
        <h1>{t.auth.checkEmailTitle}</h1>
        <p className="muted">{t.auth.checkEmail(email)}</p>
        <ResendButton email={email} />
      </div>
    </AuthLayout>
  );

  return (
    <AuthLayout>
      <form className="card card-pad stack" onSubmit={submit} noValidate={false}>
        <div><h1>{t.auth.signupTitle}</h1><p className="muted small" style={{ marginTop: 6 }}>{t.auth.signupSub}</p></div>
        {err && <div className="form-error" role="alert">{err}</div>}
        <Field label={t.auth.fullName}><input value={name} onChange={e => setName(e.target.value)} required maxLength={120} autoComplete="name" /></Field>
        <Field label={t.auth.email}><input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" /></Field>
        <div className="grid-2">
          <Field label={t.auth.phone}><input type="tel" value={phone} onChange={e => setPhone(e.target.value)} required autoComplete="tel" pattern="[0-9+() .\-]{6,30}" placeholder="+593 99 123 4567" /></Field>
          <Field label={t.auth.country}>
            <select value={country} onChange={e => setCountry(e.target.value)} autoComplete="country">
              {COUNTRIES.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
            </select>
          </Field>
        </div>
        <Field label={t.auth.password}>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={10} autoComplete="new-password" />
        </Field>
        <p className="small faint" style={{ marginTop: -8 }}>{t.auth.passwordHint}</p>

        <fieldset className="stack-sm" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="eyebrow" style={{ marginBottom: 8 }}>{t.auth.childrenTitle}</legend>
          {kids.map((k, i) => (
            <div key={i} className="card card-pad stack-sm" style={{ background: 'var(--surface-2)', boxShadow: 'none' }}>
              <Field label={t.auth.childName}><input value={k.name} onChange={e => setKid(i, 'name', e.target.value)} required={i === 0} maxLength={60} /></Field>
              <div className="grid-2">
                <Field label={t.auth.school} optional><input value={k.school} onChange={e => setKid(i, 'school', e.target.value)} maxLength={120} /></Field>
                <Field label={t.auth.grade} optional><input value={k.grade} onChange={e => setKid(i, 'grade', e.target.value)} maxLength={60} /></Field>
              </div>
              {kids.length > 1 && <button type="button" className="btn ghost small" onClick={() => setKids(ks => ks.filter((_, j) => j !== i))}>{t.auth.removeChild}</button>}
            </div>
          ))}
          {kids.length < 10 && <button type="button" className="btn ghost" onClick={() => setKids(ks => [...ks, { name: '', school: '', grade: '' }])}>{t.auth.addChild}</button>}
        </fieldset>

        <label className="check"><input type="checkbox" checked={accept} onChange={e => setAccept(e.target.checked)} />
          <span>{t.auth.accept} <Link to="/terms" target="_blank">{t.auth.terms}</Link> {t.auth.and} <Link to="/privacy" target="_blank">{t.auth.privacy}</Link>.</span></label>
        <button className="btn big" disabled={busy}>{busy ? t.auth.creating : t.auth.create}</button>
        <p className="small muted" style={{ textAlign: 'center' }}>{t.auth.haveAccount} <Link to="/login">{t.auth.login}</Link></p>
      </form>
    </AuthLayout>
  );
}

function ResendButton({ email }: { email: string }) {
  const { t } = useT();
  const [done, setDone] = useState(false);
  return done ? <p className="form-ok">{t.auth.resent}</p> : (
    <button type="button" className="btn secondary" onClick={async () => {
      await supabase.auth.resend({ type: 'signup', email, options: { emailRedirectTo: appUrl('/welcome') } });
      setDone(true);
    }}>{t.auth.resend}</button>
  );
}

export function LoginPage() {
  const { t } = useT();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const { session } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const next = params.get('next')?.startsWith('/') && !params.get('next')?.startsWith('//') ? params.get('next')! : '/app';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) { setErr(authError(error.message, t)); setUnconfirmed(error.message.toLowerCase().includes('not confirmed')); return; }
    nav(next, { replace: true });
  };

  if (session) return <Navigate to={next} replace />;
  return (
    <AuthLayout>
      <form className="card card-pad stack" onSubmit={submit}>
        <h1>{t.auth.loginTitle}</h1>
        {err && <div className="form-error" role="alert">{err}</div>}
        {unconfirmed && <ResendButton email={email} />}
        <Field label={t.auth.email}><input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" /></Field>
        <Field label={t.auth.password}><input type="password" value={password} onChange={e => setPassword(e.target.value)} required autoComplete="current-password" /></Field>
        <button className="btn big" disabled={busy}>{busy ? t.auth.loggingIn : t.auth.login}</button>
        <div className="spread small"><Link to="/forgot-password">{t.auth.forgot}</Link><span>{t.auth.noAccount} <Link to="/signup">{t.landing.navStart}</Link></span></div>
      </form>
    </AuthLayout>
  );
}

export function ForgotPasswordPage() {
  const { t } = useT();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  return (
    <AuthLayout>
      <form className="card card-pad stack" onSubmit={async e => {
        e.preventDefault();
        await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: appUrl('/reset-password') });
        setSent(true);   // same answer whether or not the e-mail exists
      }}>
        <h1>{t.auth.forgotTitle}</h1>
        {sent ? <p className="form-ok">{t.auth.forgotSent}</p> : <>
          <Field label={t.auth.email}><input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" /></Field>
          <button className="btn big">{t.auth.forgotSend}</button>
        </>}
        <Link to="/login" className="small">{t.common.back}</Link>
      </form>
    </AuthLayout>
  );
}

export function ResetPasswordPage() {
  const { t } = useT();
  const nav = useNavigate();
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  return (
    <AuthLayout>
      <form className="card card-pad stack" onSubmit={async e => {
        e.preventDefault();
        if (password.length < 10) { setErr(t.auth.weak); return; }
        const { error } = await supabase.auth.updateUser({ password });
        if (error) { setErr(authError(error.message, t)); return; }
        nav('/app', { replace: true });
      }}>
        <h1>{t.auth.resetTitle}</h1>
        {err && <div className="form-error" role="alert">{err}</div>}
        <Field label={t.auth.password}><input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={10} autoComplete="new-password" /></Field>
        <button className="btn big">{t.auth.resetSave}</button>
      </form>
    </AuthLayout>
  );
}
