import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell, RequireAuth } from './components/AppShell';
import { LandingPage } from './pages/Landing';
import { ForgotPasswordPage, LoginPage, ResetPasswordPage, SignupPage } from './pages/Signup';
import { ContactPage, PrivacyPage, TermsPage } from './pages/Legal';
import { Spinner } from './components/ui';

// The signed-in app is loaded on demand, so the public pages stay light on mobile data.
const page = <K extends string>(load: () => Promise<Record<K, React.ComponentType>>, name: K) =>
  lazy(() => load().then(m => ({ default: m[name] })));
const OnboardingPage = page(() => import('./pages/Onboarding'), 'OnboardingPage');
const DashboardPage = page(() => import('./pages/Dashboard'), 'DashboardPage');
const TodayPage = page(() => import('./pages/Lists'), 'TodayPage');
const OverduePage = page(() => import('./pages/Lists'), 'OverduePage');
const CompletedPage = page(() => import('./pages/Lists'), 'CompletedPage');
const WeekPage = page(() => import('./pages/Week'), 'WeekPage');
const CalendarPage = page(() => import('./pages/Calendar'), 'CalendarPage');
const ChildrenPage = page(() => import('./pages/Children'), 'ChildrenPage');
const AddTaskPage = page(() => import('./pages/AddTask'), 'AddTaskPage');
const SettingsPage = page(() => import('./pages/Settings'), 'SettingsPage');
const SubscriptionPage = page(() => import('./pages/Subscription'), 'SubscriptionPage');
const AdminPage = page(() => import('./pages/Admin'), 'AdminPage');

export function App() {
  return (
    <Suspense fallback={<Spinner />}>
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<RequireAuth><ResetPasswordPage /></RequireAuth>} />
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="/terms" element={<TermsPage />} />
      <Route path="/contact" element={<ContactPage />} />
      <Route path="/welcome" element={<RequireAuth><OnboardingPage /></RequireAuth>} />
      <Route path="/app" element={<RequireAuth><AppShell /></RequireAuth>}>
        <Route index element={<DashboardPage />} />
        <Route path="today" element={<TodayPage />} />
        <Route path="week" element={<WeekPage />} />
        <Route path="calendar" element={<CalendarPage />} />
        <Route path="children" element={<ChildrenPage />} />
        <Route path="add" element={<AddTaskPage />} />
        <Route path="completed" element={<CompletedPage />} />
        <Route path="overdue" element={<OverduePage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="subscription" element={<SubscriptionPage />} />
        <Route path="admin" element={<AdminPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </Suspense>
  );
}
