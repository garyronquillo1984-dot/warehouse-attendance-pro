import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useOrg, canManage } from '../lib/org';
import { Wordmark } from './ui';

const BUY_URL = (import.meta.env.VITE_BUY_URL as string | undefined) || '';


export default function AppShell() {
  const { orgs, current, select } = useOrg();
  const nav = useNavigate();
  const [platformAdmin, setPlatformAdmin] = useState(false);
  useEffect(() => { supabase.rpc('am_platform_admin').then(({ data }) => setPlatformAdmin(!!data)); }, []);
  const [isDemo, setIsDemo] = useState(false);
  useEffect(() => {
    if (!current) return;
    supabase.from('organizations').select('is_demo').eq('id', current.organization_id).maybeSingle()
      .then(({ data }) => setIsDemo(!!data?.is_demo));
  }, [current]);

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
        <button className="btn btn-ghost small bar-btn wide-only" onClick={signOut}>Sign out</button>
        {/* Phones: the bottom bar has no room for the account link, so it lives up here. */}
        <NavLink className="btn btn-ghost small bar-btn narrow-only" to="/account">Account</NavLink>
      </header>
      {isDemo && (
        <div className="demo-bar" role="note">
          <span><strong>Demo with sample data.</strong> Only you see it, and it’s erased after 24 hours.</span>
          {BUY_URL && <a className="btn btn-primary small" href={BUY_URL} target="_blank" rel="noopener">Get Warehouse Attendance Pro</a>}
          <button className="btn-link small" onClick={signOut}>Leave demo</button>
        </div>
      )}
      <div className="body">
        <nav className="sidenav" aria-label="Main">
          <NavLink to="/" end>Today</NavLink>
          <NavLink to="/attendance">Attendance</NavLink>
          <NavLink to="/employees">Employees</NavLink>
          <NavLink to="/reports">Reports</NavLink>
          {canManage(current) && <NavLink to="/settings">Settings</NavLink>}
          <NavLink to="/account" className="wide-only">My account</NavLink>
          {platformAdmin && <NavLink to="/admin" className="wide-only">Admin</NavLink>}
        </nav>
        <main className="main" id="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
