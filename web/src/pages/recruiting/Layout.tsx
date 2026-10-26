import { createContext, useContext } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useOrg, canManage } from '../../lib/org';
import { useWorkspace, type Workspace } from '../../lib/workspace';
import { todayIn } from '../../lib/time';
import { LangProvider, LangToggle, useLang } from '../../lib/i18n';
import { useRecruitingSetup, type RecruitingSetup } from '../../lib/recruiting';
import { Loading, Notice } from '../../components/ui';
import type { MyOrg } from '../../lib/types';

interface Ctx { org: MyOrg; manage: boolean; ws: Workspace; setup: RecruitingSetup; today: string }
const RecruitingContext = createContext<Ctx | null>(null);

export function useRecruiting() {
  const ctx = useContext(RecruitingContext);
  if (!ctx) throw new Error('useRecruiting must be used inside the recruiting layout');
  return ctx;
}

function Tabs({ manage }: { manage: boolean }) {
  const { t } = useLang();
  const tabs: [string, string, boolean?][] = [
    ['/recruiting', t('Dashboard', 'Panel')],
    ['/recruiting/candidates', t('Candidates', 'Candidatos')],
    ['/recruiting/pipeline', t('Pipeline', 'Pipeline')],
    ['/recruiting/tasks', t('Tasks', 'Tareas')],
    ['/recruiting/openings', t('Openings', 'Vacantes')],
    ['/recruiting/calendar', t('Calendar', 'Calendario')],
    ['/recruiting/sources', t('Sources & QR', 'Fuentes y QR')],
    ['/recruiting/agencies', t('Agencies', 'Agencias')],
    ['/recruiting/templates', t('Messages', 'Mensajes')],
    ['/recruiting/report', t('Reports', 'Reportes')],
    ['/recruiting/settings', t('Settings', 'Ajustes'), true],
  ];
  return (
    <nav className="subnav" aria-label={t('Recruiting', 'Reclutamiento')}>
      {tabs.filter(([, , m]) => !m || manage).map(([to, name]) => (
        <NavLink key={to} to={to} end={to === '/recruiting'}>{name}</NavLink>
      ))}
    </nav>
  );
}

function Inner() {
  const { current } = useOrg();
  const manage = canManage(current);
  const ws = useWorkspace(current?.organization_id);
  const setup = useRecruitingSetup(current?.organization_id, manage);
  const { t } = useLang();
  if (!current || ws.loading || setup.loading) return <Loading label={t('Loading…', 'Cargando…')} />;
  if (!ws.warehouses.length) return <Notice kind="info">{t('You don’t have access to a warehouse yet.', 'Aún no tienes acceso a un almacén.')}</Notice>;
  const today = todayIn(ws.timezone);
  return (
    <RecruitingContext.Provider value={{ org: current, manage, ws, setup, today }}>
      <div className="stack-lg">
        <div className="rec-head">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="eyebrow">{t('Recruiting', 'Reclutamiento')}</span>
            <LangToggle />
          </div>
          <Tabs manage={manage} />
        </div>
        {setup.error && <Notice kind="error">{setup.error}</Notice>}
        <Outlet />
      </div>
    </RecruitingContext.Provider>
  );
}

export default function RecruitingLayout() {
  return <LangProvider><Inner /></LangProvider>;
}
