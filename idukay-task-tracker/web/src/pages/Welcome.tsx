import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { openLink, saveToken, savedToken } from '../lib/viewer';
import { useT } from '../lib/i18n';
import { BrandMark } from '../components/Icons';
import { Spinner } from '../components/ui';

export function PublicFooter() {
  const { t, lang, setLang } = useT();
  return (
    <footer className="footer">
      <div className="footer-inner">
        <div className="row-wrap">
          <Link to="/privacidad">{t.legal.privacyTitle}</Link>·<Link to="/condiciones">{t.legal.termsTitle}</Link>·<Link to="/contacto">{t.legal.contactTitle}</Link>·
          <button type="button" className="btn ghost small" onClick={() => setLang(lang === 'es' ? 'en' : 'es')}>{lang === 'es' ? 'English' : 'Español'}</button>
        </div>
        <p>{t.common.notAffiliated}</p>
      </div>
    </footer>
  );
}

// No link on this device yet: explain what the app is and how to get in. Nothing to buy.
export function WelcomePage() {
  const { t } = useT();
  if (savedToken()) return <Navigate to="/hoy" replace />;
  return (
    <div className="public">
      <header className="public-nav"><Link to="/" className="brand"><BrandMark />{t.common.appName}</Link></header>
      <main className="public-main">
        <section className="welcome stack">
          <span className="pill free-pill">{t.common.free}</span>
          <h1>{t.link.welcomeTitle}</h1>
          <p className="sub muted">{t.common.purpose}</p>
          <div className="card card-pad stack-sm">
            <p>🔗 {t.link.welcomeText}</p>
            <p className="small muted">{t.link.keepPrivate}</p>
          </div>
          <div className="card card-pad stack-sm">
            <h3>{t.link.howTitle}</h3>
            <ol className="how">{t.link.how.map(x => <li key={x}>{x}</li>)}</ol>
          </div>
          <p className="small faint">{t.common.notOfficial}</p>
          <Link className="small" to="/admin">{t.link.adminLogin}</Link>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}

// /v/<token>: check the link, keep it on this device and move it out of the address bar.
export function OpenLinkPage() {
  const { token = '' } = useParams();
  const { t } = useT();
  const nav = useNavigate();
  const [bad, setBad] = useState(false);
  useEffect(() => {
    openLink(token).then(d => {
      if (d && d.students.length) { saveToken(token); nav('/hoy', { replace: true }); }
      else setBad(true);
    }).catch(() => setBad(true));
  }, [token, nav]);
  if (!bad) return <Spinner />;
  return (
    <div className="public"><main className="public-main">
      <div className="auth-box card card-pad stack" data-testid="invalid-link">
        <div style={{ fontSize: 40 }} aria-hidden>🔗</div>
        <h1>{t.link.invalidTitle}</h1>
        <p className="muted">{t.link.invalid}</p>
        <Link className="btn secondary" to="/">{t.common.back}</Link>
      </div>
    </main></div>
  );
}
