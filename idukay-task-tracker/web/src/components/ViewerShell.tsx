import { useEffect, useState } from 'react';
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ViewerProvider, forgetToken, savedToken, useViewer } from '../lib/viewer';
import { useT } from '../lib/i18n';
import { BrandMark, IconMore } from './Icons';
import { Sheet, Spinner } from './ui';

// The parent's app: three screens, read-only. Today · Last 2 weeks · Archive.
export function ViewerShell() {
  const token = savedToken();
  if (!token) return <Navigate to="/" replace />;
  return <ViewerProvider token={token}><ViewerFrame /></ViewerProvider>;
}

function ViewerFrame() {
  const v = useViewer();
  const { t, lang, setLang } = useT();
  const loc = useLocation();
  const nav = useNavigate();
  const [menu, setMenu] = useState(false);
  useEffect(() => { if (!loc.pathname.startsWith('/tarea/')) window.scrollTo(0, 0); }, [loc.pathname]);

  if (v.status === 'loading') return <Spinner />;
  if (v.status === 'invalid') return (
    <div className="auth-box card card-pad stack" data-testid="invalid-link" style={{ margin: '12vh 16px 0' }}>
      <div style={{ fontSize: 40 }} aria-hidden>🔗</div>
      <h1>{t.link.invalidTitle}</h1>
      <p className="muted">{t.link.invalid}</p>
      <button type="button" className="btn secondary" onClick={() => { forgetToken(); nav('/', { replace: true }); }}>{t.common.close}</button>
    </div>
  );
  if (v.status === 'error' || !v.student) return (
    <div className="auth-box card card-pad stack" style={{ margin: '12vh 16px 0' }}>
      <p>{t.common.error}</p><button type="button" className="btn" onClick={() => void v.refresh()}>{t.common.retry}</button>
    </div>
  );
  const s = v.student;
  const students = v.data?.students ?? [];

  return (
    <div className="viewer">
      <header className="topbar">
        <div className="topbar-inner">
          <Link to="/hoy" className="brand"><BrandMark /><span>{t.common.appName}</span></Link>
          <div className="grow" />
          <span className="pill neutral readonly-pill">👁 {t.common.readOnly}</span>
          <button type="button" className="icon-btn" onClick={() => setMenu(true)} aria-label={t.nav.menu}><IconMore /></button>
        </div>
        <div className="topbar-inner child-bar">
          {students.length > 1 ? (
            <div className="child-switch" role="tablist" aria-label={t.nav.child}>
              {students.map(x => (
                <button type="button" role="tab" key={x.id} aria-selected={x.id === s.id} className={`chip${x.id === s.id ? ' active' : ''}`} onClick={() => v.selectStudent(x.id)}>
                  {x.first_name}
                </button>
              ))}
            </div>
          ) : <strong className="child-name">{s.first_name}</strong>}
          <span className="small muted class-label" data-testid="class-label">{s.grade_short} · {lang === 'es' ? 'Paralelo' : 'Parallel'} {s.parallel}</span>
        </div>
      </header>
      {/* Outside the header: its backdrop blur would otherwise pin this "fixed" bar to the header. */}
      <nav className="viewer-tabs" aria-label="Main">
        <NavLink to="/hoy">🏠 {t.nav.today}</NavLink>
        <NavLink to="/semanas">📅 {t.nav.twoWeeks}</NavLink>
        <NavLink to="/archivo">📁 {t.nav.archive}</NavLink>
      </nav>

      <main className="main viewer-main" id="main"><Outlet /></main>

      <Sheet open={menu} onClose={() => setMenu(false)} title={<h2>{t.nav.menu}</h2>}>
        <div className="menu-list">
          <button type="button" onClick={() => { setLang(lang === 'es' ? 'en' : 'es'); setMenu(false); }}>🌐 {t.nav.language}</button>
          <Link to="/privacidad" onClick={() => setMenu(false)}>🔒 {t.legal.privacyTitle}</Link>
          <button type="button" onClick={() => { if (confirm(t.link.forgetConfirm)) { forgetToken(); nav('/', { replace: true }); } }}>🚪 {t.nav.forget}</button>
        </div>
        <p className="small faint" style={{ marginTop: 12 }}>{t.link.keepPrivate} {t.common.notOfficial}</p>
      </Sheet>
    </div>
  );
}
