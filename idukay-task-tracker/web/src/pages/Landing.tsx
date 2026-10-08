import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useT } from '../lib/i18n';
import { PRICE_LABEL, SUPPORT_EMAIL } from '../lib/config';
import { BrandMark, IconCheck } from '../components/Icons';

export function PublicFooter() {
  const { t, lang, setLang } = useT();
  return (
    <footer className="footer">
      <div className="footer-inner">
        <div className="row-wrap">
          <Link to="/privacy">{t.landing.footerPrivacy}</Link>·<Link to="/terms">{t.landing.footerTerms}</Link>·<Link to="/contact">{t.landing.footerContact}</Link>·
          <button type="button" className="btn ghost small" onClick={() => setLang(lang === 'es' ? 'en' : 'es')}>{lang === 'es' ? 'English' : 'Español'}</button>
        </div>
        <p>{t.common.notAffiliated}</p>
        <p>© {new Date().getFullYear()} {t.common.appName}</p>
      </div>
    </footer>
  );
}

// A static picture of the dashboard (fictional data, no database involved).
function Preview() {
  const { t, lang } = useT();
  const es = lang === 'es';
  const rows: Array<[string, string, boolean, string]> = es
    ? [['Resolver ejercicios 1-10', 'Matemática', true, '#a2542f'], ['Leer capítulo 3', 'Lengua', false, '#a2542f'], ['Tablas del 1 al 5', 'Matemática', false, '#2f6690']]
    : [['Exercises 1-10', 'Math', true, '#a2542f'], ['Read chapter 3', 'Language', false, '#a2542f'], ['Times tables 1-5', 'Math', false, '#2f6690']];
  return (
    <div className="preview-frame" aria-hidden>
      <div className="stack-sm">
        <h3>{t.greeting.morning}, Ana 👋</h3>
        <div className="card card-pad stack-sm">
          <div className="spread"><strong className="small">{t.dashboard.progress}</strong><strong className="small">2/3</strong></div>
          <div className="progress"><div style={{ width: '66%' }} /></div>
        </div>
        {[['Sofía', '#a2542f', 1, 1, 2], ['Mateo', '#2f6690', 1, 3, 0]].map(([n, c, p, d, tm]) => (
          <div key={n as string} className="kid-card">
            <div className="kid-head" style={{ background: `color-mix(in srgb, ${c} 14%, var(--surface))`, padding: '8px 12px' }}><h3 style={{ color: c as string, fontSize: 15 }}>{n}</h3></div>
            <div className="kid-stats small" style={{ padding: '8px 12px', fontSize: 12.5 }}>
              <span><i className="dot red" />{t.dashboard.pendingN(p as number)}</span><span><i className="dot green" />{t.dashboard.completedN(d as number)}</span><span><i className="dot yellow" />{t.dashboard.tomorrowN(tm as number)}</span>
            </div>
          </div>
        ))}
        <div className="card">
          {rows.map(([title, subj, done, color]) => (
            <div key={title} className={`task-row${done ? ' is-done' : ''}`}>
              <span className={`tick${done ? ' on' : ''}`}><span className="box">{done && <IconCheck />}</span></span>
              <div className="task-main"><div className="task-title" style={{ fontSize: 14 }}>{title}</div>
                <div className="task-meta"><i className="kid-dot" style={{ background: color }} />{subj}</div></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function LandingPage() {
  const { t } = useT();
  const { session } = useAuth();
  return (
    <div className="public">
      <header className="public-nav">
        <Link to="/" className="brand"><BrandMark />{t.common.appName}</Link>
        <div className="row">
          {session ? <Link className="btn small" to="/app">{t.landing.openApp}</Link> : <>
            <Link className="btn ghost small" to="/login">{t.landing.navLogin}</Link>
            <Link className="btn small" to="/signup">{t.landing.navStart}</Link>
          </>}
        </div>
      </header>
      <main className="public-main">
        <section className="hero">
          <div className="stack">
            <h1>{t.landing.headline1}<span className="accent">{t.landing.headline2}</span></h1>
            <p className="sub">{t.landing.sub}</p>
            <div className="row-wrap">
              <Link className="btn big" to="/signup">{t.landing.cta}</Link>
              <a className="btn big secondary" href="#how">{t.landing.how}</a>
            </div>
            <p className="small muted">{t.landing.noCard}</p>
          </div>
          <Preview />
        </section>

        <section className="section">
          <h2>{t.landing.problemTitle}</h2>
          <div className="grid-2">{t.landing.problem.map(p => <div key={p} className="card card-pad">{p}</div>)}</div>
        </section>

        <section className="section">
          <h2>{t.landing.solutionTitle}</h2>
          <p className="muted" style={{ fontSize: 18, maxWidth: 40 + 'em' }}>{t.landing.solution}</p>
        </section>

        <section className="section" id="how">
          <h2>{t.landing.howTitle}</h2>
          <div className="steps">
            {t.landing.steps.map(([h, p], i) => <div key={h} className="card card-pad"><div className="step-n">{i + 1}</div><h3>{h}</h3><p className="muted">{p}</p></div>)}
          </div>
          <p className="small muted">{t.common.sourceNote}</p>
        </section>

        <section className="section">
          <h2>{t.landing.featuresTitle}</h2>
          <div className="features">{t.landing.features.map(([h, p]) => <div key={h} className="card feature"><h3>{h}</h3><p className="muted small">{p}</p></div>)}</div>
        </section>

        <section className="section" id="pricing">
          <h2>{t.landing.trialTitle}</h2>
          <p className="muted">{t.landing.trialText}</p>
          <div className="card price-card">
            <span className="eyebrow">{t.landing.priceTitle}</span>
            <div><span className="amount">{PRICE_LABEL}</span> <span className="muted">USD{t.landing.pricePer}</span></div>
            <ul>{t.landing.priceItems.map(x => <li key={x}>{x}</li>)}</ul>
            <Link className="btn big" to="/signup">{t.landing.cta}</Link>
          </div>
        </section>

        <section className="section" id="faq">
          <h2>{t.landing.faqTitle}</h2>
          <div className="stack-sm">{t.landing.faq.map(([q, a]) => <details key={q} className="faq"><summary>{q}</summary><p>{a}</p></details>)}</div>
        </section>

        <section className="section" id="privacy">
          <h2>{t.landing.privacyTitle}</h2>
          <p className="muted">{t.landing.privacyText} <Link to="/privacy">{t.landing.footerPrivacy}</Link> · <Link to="/terms">{t.landing.footerTerms}</Link></p>
        </section>

        <section className="section" id="contact">
          <h2>{t.landing.contactTitle}</h2>
          <p><a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a></p>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
