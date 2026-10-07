import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useOrg, canManage } from '../lib/org';
import { Wordmark } from './ui';

const SOON = ['Reports'];

export default function AppShell() {
  const { orgs, current, select } = useOrg();
  const nav = useNavigate();

  async function signOut() {
    await supabase.auth.signOut();
    nav('/login', { replace: true });
  }

  return (
    <div className="shell">
      <header className="topbar">
        <Wordmark to="/" />
        <div className="spacer" />
        {orgs.length > 1 ? (
          <label className="row small" style={{ gap: 8 }}>
            <span className="sr-only" style={{ position: 'absolute', left: -9999 }}>Company</span>
            <select aria-label="Company" value={current?.organization_id} onChange={e => select(e.target.value)}>
              {orgs.map(o => <option key={o.organization_id} value={o.organization_id}>{o.name}</option>)}
            </select>
          </label>
        ) : (
          <strong className="small" style={{ opacity: 0.9 }}>{current?.name}</strong>
        )}
        <button className="btn btn-ghost small" style={{ color: 'inherit', minHeight: 40, borderColor: 'rgba(238,240,236,.35)' }} onClick={signOut}>
          Sign out
        </button>
      </header>
      <div className="body">
        <nav className="sidenav" aria-label="Main">
          <NavLink to="/" end>Today</NavLink>
          <NavLink to="/attendance">Attendance</NavLink>
          <NavLink to="/employees">Employees</NavLink>
          {SOON.map(s => <span key={s} aria-disabled="true">{s} <span className="soon">Coming soon</span></span>)}
          {canManage(current) && <NavLink to="/settings">Settings</NavLink>}
          <NavLink to="/account"><span className="wide-only">My account</span><span className="narrow-only">Account</span></NavLink>
        </nav>
        <main className="main" id="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
