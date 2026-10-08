import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { OpenLinkPage, WelcomePage } from './pages/Welcome';
import { ContactPage, PrivacyPage, TermsPage } from './pages/Legal';
import { ViewerShell } from './components/ViewerShell';
import { Spinner } from './components/ui';

const page = <K extends string>(load: () => Promise<Record<K, React.ComponentType>>, name: K) =>
  lazy(() => load().then(m => ({ default: m[name] })));
// Parents (VIEWER): three screens + details.
const TodayPage = page(() => import('./pages/viewer/Today'), 'TodayPage');
const TwoWeeksPage = page(() => import('./pages/viewer/TwoWeeks'), 'TwoWeeksPage');
const ArchivePage = page(() => import('./pages/viewer/Archive'), 'ArchivePage');
const DetailPage = page(() => import('./pages/viewer/Detail'), 'DetailPage');
// Administrator (loaded only when visiting /admin).
const AdminShell = page(() => import('./components/AdminShell'), 'AdminShell');
const ResetPasswordPage = page(() => import('./components/AdminShell'), 'ResetPasswordPage');
const StatusPage = page(() => import('./pages/admin/Class'), 'StatusPage');
const StudentsPage = page(() => import('./pages/admin/Class'), 'StudentsPage');
const SubjectsPage = page(() => import('./pages/admin/Class'), 'SubjectsPage');
const HomeworkListPage = page(() => import('./pages/admin/Homework'), 'HomeworkListPage');
const HomeworkEditPage = page(() => import('./pages/admin/Homework'), 'HomeworkEditPage');
const AddHomeworkPage = page(() => import('./pages/admin/Homework'), 'AddHomeworkPage');

export function App() {
  return (
    <Suspense fallback={<Spinner />}>
      <Routes>
        <Route path="/" element={<WelcomePage />} />
        <Route path="/v/:token" element={<OpenLinkPage />} />
        <Route path="/privacidad" element={<PrivacyPage />} />
        <Route path="/condiciones" element={<TermsPage />} />
        <Route path="/contacto" element={<ContactPage />} />
        <Route element={<ViewerShell />}>
          <Route path="/hoy" element={<TodayPage />} />
          <Route path="/semanas" element={<TwoWeeksPage />} />
          <Route path="/archivo" element={<ArchivePage />} />
          <Route path="/tarea/:id" element={<DetailPage />} />
        </Route>
        <Route path="/admin/restablecer" element={<ResetPasswordPage />} />
        <Route path="/admin" element={<AdminShell />}>
          <Route index element={<StatusPage />} />
          <Route path="tareas" element={<HomeworkListPage />} />
          <Route path="tareas/:id" element={<HomeworkEditPage />} />
          <Route path="agregar" element={<AddHomeworkPage />} />
          <Route path="estudiantes" element={<StudentsPage />} />
          <Route path="materias" element={<SubjectsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
