import { createContext, useContext, useEffect, useState, type FormEvent } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { supabase, appUrl } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { useT } from '../lib/i18n';
import { BrandMark } from './Icons';
import { Field, Spinner } from './ui';

export interface ClassStatus {
  class_id: string; grade_label: string; grade_short: string; parallel: string; school_name: string | null; school_year: string | null;
  timezone: string; today: string; last_sync_at: string | null; data_updated_at: string | null;
  students: number; active_links: number; homework_total: number; homework_active: number;
  last_run: { source: string; status: string; started_at: string; added: number; updated: number; unchanged: number; message: string | null } | null;
}

interface AdminCtx { classes: ClassStatus[]; cls: ClassStatus; setClassId: (id: string) => void; reload: () => Promise<void> }
const Ctx = createContext<AdminCtx | null>(null);
export const useAdmin = () => { const v = useContext(Ctx); if (!v) throw new Error('useAdmin outside AdminShell'); return v; };

// The ADMIN area: a signed-in account listed as administrator in the database. Everything here
// is also enforced by the database; hiding the screens is only for convenience.
export function AdminShell() {
  const { session, loading } = useAuth();
  const { t } = useT();
  const nav = useNavigate();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [classes, setClasses] = useState<ClassStatus[] | null>(null);
  const [classId, setClassId] = useState<string | null>(null);

  const reload = async () => {
    const { data } = await supabase.rpc('admin_status');
    setClasses((data as ClassStatus[]) ?? []);
  };
  useEffect(() => {
    if (!session) { setIsAdmin(null); return; }
    supabase.rpc('am_i_admin').then(({ data }) => { setIsAdmin(data === true); if (data === true) void reload(); });
  }, [session]);

  if (loading) return <Spinner />;
  if (!session) return <AdminLogin />;
  if (isAdmin === null || (isAdmin && classes === null)) return <Spinner />;
  if (!isAdmin) return (
    <div className="auth-box card card-pad stack" style={{ margin: '12vh auto 0' }}>
      <p>{t.admin.notAdmin}</p>
      <button type="button" className="btn secondary" onClick={() => supabase.auth.signOut()}>{t.admin.signOut}</button>
    </div>
  );
  const cls = classes!.find(c => c.class_id === classId) ?? classes![0];
  if (!cls) return <p className="card-pad">—</p>;
  const signOut = async () => { await supabase.auth.signOut(); nav('/admin'); };

  return (
    <Ctx.Provider value={{ classes: classes!, cls, setClassId, reload }}>
      <div className="admin">
        <header className="topbar">
          <div className="topbar-inner admin-inner">
            <Link to="/admin" className="brand"><BrandMark /><span>{t.admin.title}</span></Link>
            {classes!.length > 1 ? (
              <select className="input" style={{ width: 'auto', minHeight: 38 }} value={cls.class_id} onChange={e => setClassId(e.target.value)}>
                {classes!.map(c => <option key={c.class_id} value={c.class_id}>{c.grade_short} {c.parallel}</option>)}
              </select>
            ) : <span className="pill neutral">{cls.grade_short} · Paralelo {cls.parallel}</span>}
            <div className="grow" />
            <button type="button" className="btn ghost small" onClick={signOut}>{t.admin.signOut}</button>
          </div>
          <nav className="admin-tabs">
            <NavLink to="/admin" end>{t.admin.nav.status}</NavLink>
            <NavLink to="/admin/tareas">{t.admin.nav.homework}</NavLink>
            <NavLink to="/admin/agregar">{t.admin.nav.add}</NavLink>
            <NavLink to="/admin/estudiantes">{t.admin.nav.students}</NavLink>
            <NavLink to="/admin/materias">{t.admin.nav.subjects}</NavLink>
          </nav>
        </header>
        <main className="main admin-main"><Outlet /></main>
      </div>
    </Ctx.Provider>
  );
}

function AdminLogin() {
  const { t } = useT();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setErr(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) setErr(t.admin.badLogin);
  };
  return (
    <div className="public"><main className="public-main">
      <form className="auth-box card card-pad stack" onSubmit={submit}>
        <Link to="/" className="brand"><BrandMark />{t.common.appName}</Link>
        <h1>{t.admin.title}</h1>
        {err && <div className="form-error" role="alert">{err}</div>}
        <Field label={t.admin.email}><input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="username" /></Field>
        <Field label={t.admin.password}><input type="password" value={password} onChange={e => setPassword(e.target.value)} required autoComplete="current-password" /></Field>
        <button className="btn big" disabled={busy}>{busy ? t.admin.loggingIn : t.admin.login}</button>
        {sent ? <p className="form-ok small">✓</p> : (
          <button type="button" className="btn ghost small" disabled={!email} onClick={async () => {
            await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: appUrl('/admin/restablecer') }); setSent(true);
          }}>{t.admin.forgot}</button>
        )}
      </form>
    </main></div>
  );
}

export function ResetPasswordPage() {
  const { t } = useT();
  const nav = useNavigate();
  const [pw, setPw] = useState('');
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="public"><main className="public-main">
      <form className="auth-box card card-pad stack" onSubmit={async e => {
        e.preventDefault();
        const { error } = await supabase.auth.updateUser({ password: pw });
        if (error) setErr(t.common.error); else nav('/admin', { replace: true });
      }}>
        <h1>{t.admin.password}</h1>
        {err && <div className="form-error">{err}</div>}
        <Field label={t.admin.password}><input type="password" minLength={10} value={pw} onChange={e => setPw(e.target.value)} required autoComplete="new-password" /></Field>
        <button className="btn big">{t.common.save}</button>
      </form>
    </main></div>
  );
}
