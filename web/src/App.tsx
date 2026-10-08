import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './lib/auth';
import { OrgProvider, useOrg, canManage } from './lib/org';
import { pendingInvite, useSetupStatus } from './lib/setup';
import { AuthLayout, Loading } from './components/ui';
import { TwoStepChallenge } from './components/TwoStep';
import Admin from './pages/Admin';
import Demo from './pages/Demo';
import { Terms, Privacy } from './pages/Legal';
import AppShell from './components/AppShell';
import Login from './pages/Login';
import Signup from './pages/Signup';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Setup from './pages/Setup';
import Inactive from './pages/Inactive';
import Home from './pages/Home';
import Settings from './pages/Settings';
import Account from './pages/Account';
import AcceptInvite from './pages/AcceptInvite';
import Employees from './pages/Employees';
import EmployeeForm from './pages/EmployeeForm';
import ImportEmployees from './pages/ImportEmployees';
import Attendance from './pages/Attendance';
import Reports from './pages/Reports';

// Signed-out visitors only (signed-in users go to the app).
function PublicOnly() {
  const { session, loading, recovering } = useAuth();
  if (loading) return <Loading />;
  if (recovering) return <Navigate to="/reset-password" replace />;
  return session ? <Navigate to="/" replace /> : <Outlet />;
}

function RequireAuth() {
  const { session, loading, recovering, needsCode, recheckCode } = useAuth();
  const loc = useLocation();
  if (loading) return <Loading />;
  if (recovering) return <Navigate to="/reset-password" replace />;
  if (!session) {
    const back = loc.pathname + loc.search;
    return <Navigate to={back === '/' ? '/login' : `/login?next=${encodeURIComponent(back)}`} replace />;
  }
  if (needsCode) return <AuthLayout><TwoStepChallenge onDone={recheckCode} /></AuthLayout>;
  return <OrgProvider><Outlet /></OrgProvider>;
}

// Inside the app: send people to setup, the inactive page or an invitation when needed.
// This only decides what to show; the database enforces access on every request.
function AppGate() {
  const { orgs, current, loading } = useOrg();
  const manage = canManage(current);
  const status = useSetupStatus(current?.organization_id, !!current && manage);
  if (pendingInvite.get()) return <Navigate to="/invite" replace />;
  if (loading || (manage && status.loading)) return <Loading />;
  if (!orgs.length) return <Navigate to="/setup" replace />;
  // No active license: nobody captures attendance. (Owner/Admin keep read access in the
  // database for 30 days so a later export screen can still reach their data.)
  if (current && !current.can_write) return <Inactive />;
  if (manage && current?.can_write && (!status.warehouses.length || !status.shiftCount)) return <Navigate to="/setup" replace />;
  return <AppShell />;
}

export default function App() {
  return (
    <Routes>
      <Route element={<PublicOnly />}>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
      </Route>
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/demo" element={<Demo />} />
      <Route path="/terms" element={<Terms />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/invite" element={<OrgProvider><AcceptInvite /></OrgProvider>} />
      <Route element={<RequireAuth />}>
        <Route path="/setup" element={<Setup />} />
        <Route path="/admin" element={<Admin />} />
        <Route element={<AppGate />}>
          <Route path="/" element={<Home />} />
          <Route path="/attendance" element={<Attendance />} />
          <Route path="/employees" element={<Employees />} />
          <Route path="/employees/new" element={<EmployeeForm />} />
          <Route path="/employees/import" element={<ImportEmployees />} />
          <Route path="/employees/:id" element={<EmployeeForm />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/account" element={<Account />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
