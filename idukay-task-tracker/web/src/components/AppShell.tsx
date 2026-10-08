import { useEffect, useState } from 'react';
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useAccount } from '../lib/account';
import { FamilyProvider } from '../lib/family';
import { useT } from '../lib/i18n';
import { supabase } from '../lib/supabase';
import { TaskSheetProvider } from './TaskSheet';
import { NotificationsButton } from './Notifications';
import { Paywall } from './Paywall';
import { Sheet, Spinner } from './ui';
import {
  BrandMark, IconAlert, IconCalendar, IconCard, IconChart, IconDone, IconHome, IconKids, IconMore, IconOut,
  IconPlus, IconSettings, IconToday, IconWeek,
} from './Icons';

// Screens a parent can still open when access is locked (to pay, export or delete).
const OPEN_WHEN_LOCKED = ['/app/subscription', '/app/settings', '/app/admin'];

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <Spinner />;
  if (!session) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname)}`} replace />;
  return <>{children}</>;
}

export function AppShell() {
  const { account, loading, error } = useAccount();
  const { t } = useT();
  const loc = useLocation();
  const navigate = useNavigate();
  const [more, setMore] = useState(false);
  // New screen → start at the top. (Only the path: ticking tasks or changing filters never scrolls.)
  useEffect(() => { window.scrollTo(0, 0); }, [loc.pathname]);

  if (loading) return <Spinner />;
  if (error || !account) {
    return <div className="auth-box card card-pad stack"><p>{t.common.error}</p><button className="btn" onClick={() => location.reload()}>{t.common.retry}</button></div>;
  }
  if (!account.onboarded) return <Navigate to="/welcome" replace />;

  const locked = account.access === 'locked' && !OPEN_WHEN_LOCKED.some(p => loc.pathname.startsWith(p));
  const signOut = async () => { await supabase.auth.signOut(); navigate('/'); };

  const primary = [
    { to: '/app', label: t.nav.dashboard, icon: <IconHome />, end: true },
    { to: '/app/today', label: t.nav.today, icon: <IconToday /> },
    { to: '/app/week', label: t.nav.week, icon: <IconWeek /> },
    { to: '/app/calendar', label: t.nav.calendar, icon: <IconCalendar /> },
  ];
  const secondary = [
    { to: '/app/children', label: t.nav.children, icon: <IconKids /> },
    { to: '/app/completed', label: t.nav.completed, icon: <IconDone /> },
    { to: '/app/overdue', label: t.nav.overdue, icon: <IconAlert /> },
    { to: '/app/settings', label: t.nav.settings, icon: <IconSettings /> },
    { to: '/app/subscription', label: t.nav.subscription, icon: <IconCard /> },
    ...(account.is_admin ? [{ to: '/app/admin', label: t.nav.admin, icon: <IconChart /> }] : []),
  ];
  const moreActive = secondary.some(i => loc.pathname.startsWith(i.to));

  return (
    <FamilyProvider>
      <TaskSheetProvider>
        <div className="shell">
          <nav className="sidebar" aria-label="Main">
            <Link to="/app" className="brand"><BrandMark />{t.common.appName}</Link>
            {primary.map(i => <NavLink key={i.to} to={i.to} end={i.end}>{i.icon}{i.label}</NavLink>)}
            <NavLink to="/app/add">{<IconPlus />}{t.nav.add}</NavLink>
            <div style={{ height: 10 }} />
            {secondary.map(i => <NavLink key={i.to} to={i.to}>{i.icon}{i.label}</NavLink>)}
            <div className="spacer" />
            <button type="button" className="navlink" onClick={signOut}><IconOut />{t.nav.signOut}</button>
          </nav>

          <div>
            <header className="topbar">
              <div className="topbar-inner">
                <Link to="/app" className="brand"><BrandMark /><span>{t.common.appName}</span></Link>
                <div className="grow" />
                <NotificationsButton />
              </div>
            </header>
            <main className="main" id="main">
              {locked ? <Paywall /> : <Outlet />}
            </main>
          </div>

          <nav className="bottom-nav" aria-label="Main">
            {primary.slice(0, 3).map(i => <NavLink key={i.to} to={i.to} end={i.end}>{i.icon}{i.label}</NavLink>)}
            <NavLink to="/app/add" className="add" aria-label={t.nav.add}><span className="fab"><IconPlus /></span></NavLink>
            <button type="button" className={moreActive || loc.pathname.startsWith('/app/calendar') ? 'active' : ''} onClick={() => setMore(true)}><IconMore />{t.nav.more}</button>
          </nav>

          <Sheet open={more} onClose={() => setMore(false)} title={<h2>{t.nav.more}</h2>}>
            <div className="menu-list" onClick={e => { if ((e.target as HTMLElement).closest('a,button')) setMore(false); }}>
              <Link to="/app/calendar"><IconCalendar />{t.nav.calendar}</Link>
              {secondary.map(i => <Link key={i.to} to={i.to}>{i.icon}{i.label}</Link>)}
              <button type="button" onClick={signOut}><IconOut />{t.nav.signOut}</button>
            </div>
          </Sheet>
        </div>
      </TaskSheetProvider>
    </FamilyProvider>
  );
}
