import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useLang } from '../../lib/i18n';
import { addDays } from '../../lib/time';
import { friendlyError } from '../../lib/errors';
import { STAGES, SHIFT_OPTIONS, POSITIONS, PHASES, phaseOf, stageLabel } from '../../lib/recruiting';
import { applyFilters, bySource, computeKpis, lowPool, type ContactEvent, type Outcome, type StageEvent } from '../../lib/recruitingMetrics';
import { Loading, Notice } from '../../components/ui';
import { useRecruiting } from './Layout';
import { useCandidates, useOpenTasks, exportTable } from './data';

export function usePeriod(today: string) {
  const [params, setParams] = useSearchParams();
  const period = params.get('period') || '30';
  const from = period === 'custom' ? params.get('from') || addDays(today, -29) : addDays(today, -(Number(period) - 1));
  const to = period === 'custom' ? params.get('to') || today : today;
  const set = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
    setParams(next, { replace: true });
  };
  return { params, period, from, to, set };
}

export function useActivity(orgId: string, since: string) {
  const [data, setData] = useState<{ stageEvents: StageEvent[]; contacts: ContactEvent[]; outcomes: Outcome[] } | null>(null);
  useEffect(() => {
    let stale = false;
    (async () => {
      const [se, ce, oc] = await Promise.all([
        supabase.from('candidate_events').select('candidate_id, stage_to, created_at').eq('organization_id', orgId).eq('kind', 'stage_change').limit(50000),
        supabase.from('candidate_events').select('candidate_id, created_at').eq('organization_id', orgId)
          .in('kind', ['call', 'sms', 'whatsapp', 'email', 'in_person']).gte('created_at', since).limit(50000),
        supabase.rpc('recruitment_outcomes', { org: orgId }),
      ]);
      if (!stale) setData({ stageEvents: (se.data ?? []) as StageEvent[], contacts: (ce.data ?? []) as ContactEvent[], outcomes: (oc.data ?? []) as Outcome[] });
    })();
    return () => { stale = true; };
  }, [orgId, since]);
  return data;
}

export default function Dashboard() {
  const { org, manage, ws, setup, today } = useRecruiting();
  const { t, lang } = useLang();
  const { list, reload } = useCandidates(org.organization_id);
  const { tasks } = useOpenTasks(org.organization_id);
  const { params, period, from, to, set } = usePeriod(today);
  const act = useActivity(org.organization_id, addDays(from, -1));
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const f = { from, to, sourceId: params.get('source') || undefined, shift: params.get('shift') || undefined,
    position: params.get('position') || undefined, stage: params.get('stage') || undefined };
  const filtered = useMemo(() => applyFilters(list ?? [], f), [list, params]); // eslint-disable-line react-hooks/exhaustive-deps
  const settings = setup.settings;
  const k = useMemo(() => list && act && tasks && computeKpis({
    all: list, filtered, stageEvents: act.stageEvents, contacts: act.contacts, outcomes: act.outcomes, tasks,
    openings: setup.openings, f, today, staleDays: settings?.stale_days ?? 3,
  }), [list, filtered, act, tasks, setup.openings, from, to, today, settings]); // eslint-disable-line react-hooks/exhaustive-deps
  const sources = useMemo(() => list && act ? bySource(filtered, act.stageEvents, setup.sources, f) : [], [filtered, act, setup.sources, from, to]); // eslint-disable-line react-hooks/exhaustive-deps
  const alerts = useMemo(() => list ? lowPool(list, setup.openings, settings?.low_pool_threshold ?? 3) : [], [list, setup.openings, settings]);

  if (!list || !act || !tasks || !k) return <Loading label={t('Loading…', 'Cargando…')} />;
  const hasSamples = list.some(c => c.is_sample);

  async function samples(load: boolean) {
    setBusy(true); setMsg(null);
    const { error } = load
      ? await supabase.rpc('load_recruitment_samples', { org: org.organization_id, wh: ws.warehouses[0].id })
      : await supabase.rpc('remove_recruitment_samples', { org: org.organization_id });
    setBusy(false);
    if (error) setMsg({ kind: 'error', text: friendlyError(error) });
    else { await Promise.all([reload(), setup.reload()]); window.location.reload(); }
  }

  const kpi = (name: string, value: number | string | null, note?: string, main?: boolean) => (
    <div className={`kpi${main ? ' kpi-main' : ''}`}>
      <span className="kpi-label">{name}</span>
      <span className="kpi-value">{value ?? '—'}</span>
      {note && <span className="kpi-note">{note}</span>}
    </div>
  );
  const goal = (n: number, g: number | undefined) => (g ? t(`goal ${g}`, `meta ${g}`) + (n >= g ? ' ✓' : '') : undefined);
  const sel = (key: string, name: string, opts: [string, string][], all: string) => (
    <div className="field">
      <label htmlFor={`d-${key}`}>{name}</label>
      <select id={`d-${key}`} value={params.get(key) ?? ''} onChange={e => set({ [key]: e.target.value })}>
        <option value="">{all}</option>
        {opts.map(([v, n]) => <option key={v} value={v}>{n}</option>)}
      </select>
    </div>
  );
  const periodLabel = from === to ? from : `${from} → ${to}`;

  async function exportSources(kind: 'csv' | 'xlsx' | 'pdf') {
    try {
      await exportTable(org.organization_id, kind, {
        title: t('Candidates by source', 'Candidatos por fuente'), description: '', numeric: [1, 2, 3, 4, 5, 6, 7, 8],
        columns: [t('Source', 'Fuente'), t('Registered', 'Registrados'), t('Contacted', 'Contactados'), t('Pre-selected', 'Preseleccionados'),
          t('Approved', 'Aprobados'), t('Started', 'Iniciaron'), t('Conversion %', 'Conversión %'), t('Spend', 'Gasto'), t('Cost / candidate', 'Costo / candidato')],
        rows: sources.map(s => [s.name, s.registered, s.contacted, s.preselected, s.authorized, s.started, s.conversion ?? '—', s.spend ?? '—', s.costPerCandidate ?? '—']),
      }, { company: org.name, scope: hasSamples ? 'INCLUDES SAMPLE DATA' : t('All sites', 'Todos los sitios'), period: periodLabel, from, to });
    } catch (e) { setMsg({ kind: 'error', text: friendlyError(e) }); }
  }

  return (
    <div className="stack-lg">
      <div className="page-head">
        <h1>{t('Recruiting dashboard', 'Panel de reclutamiento')}</h1>
        <p className="muted">{org.name} · {periodLabel}</p>
      </div>
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
      {hasSamples && (
        <Notice kind="info">
          <strong>{t('Sample data is loaded.', 'Hay datos de ejemplo cargados.')}</strong>{' '}
          {t('Rows named “Sample …” are fictional and included in these numbers. Remove them before reporting real results.',
            'Las filas llamadas “Sample …” son ficticias y están incluidas en estas cifras. Elimínalas antes de reportar resultados reales.')}{' '}
          {manage && <button className="btn-link" disabled={busy} onClick={() => samples(false)}>{t('Remove sample data', 'Eliminar datos de ejemplo')}</button>}
        </Notice>
      )}
      {!list.length && (
        <section className="panel empty">
          <h2>{t('No candidates yet', 'Aún no hay candidatos')}</h2>
          <p className="muted">{t('The dashboard fills in as you register people. Start with “Sources & QR” to create a pre-registration QR code, or add candidates by hand.',
            'El panel se llena a medida que registras personas. Empieza en “Fuentes y QR” para crear un código QR de preinscripción, o agrega candidatos a mano.')}</p>
          <div className="row">
            <Link className="btn btn-primary" to="/recruiting/candidates/new">{t('Add candidate', 'Agregar candidato')}</Link>
            {manage && <button className="btn btn-ghost" disabled={busy} onClick={() => samples(true)}>{t('Load labelled sample data', 'Cargar datos de ejemplo identificados')}</button>}
          </div>
        </section>
      )}

      <div className="filters">
        <div className="field">
          <label htmlFor="d-period">{t('Period', 'Período')}</label>
          <select id="d-period" value={period} onChange={e => set({ period: e.target.value === '30' ? '' : e.target.value })}>
            <option value="1">{t('Today', 'Hoy')}</option>
            <option value="7">{t('Last 7 days', 'Últimos 7 días')}</option>
            <option value="30">{t('Last 30 days', 'Últimos 30 días')}</option>
            <option value="90">{t('Last 90 days', 'Últimos 90 días')}</option>
            <option value="custom">{t('Custom', 'Personalizado')}</option>
          </select>
        </div>
        {period === 'custom' && (
          <div className="field">
            <label htmlFor="d-from">{t('From – to', 'Desde – hasta')}</label>
            <div className="date-row">
              <input id="d-from" type="date" value={from} max={to} onChange={e => set({ from: e.target.value })} />
              <input aria-label={t('To', 'Hasta')} type="date" value={to} min={from} max={today} onChange={e => set({ to: e.target.value })} />
            </div>
          </div>
        )}
        {sel('source', t('Source', 'Fuente'), setup.sources.map(s => [s.id, s.name]), t('All sources', 'Todas'))}
        {sel('shift', t('Shift', 'Turno'), SHIFT_OPTIONS.map(s => [s.key, s[lang]]), t('Any shift', 'Cualquiera'))}
        {sel('position', t('Position', 'Puesto'), POSITIONS.map(p => [p.key, p[lang]]), t('Any', 'Cualquiera'))}
        {sel('stage', t('Current stage', 'Etapa actual'), STAGES.map(s => [s.key, stageLabel(s.key, lang, settings)]), t('Any', 'Cualquiera'))}
      </div>

      <section className="stack" aria-labelledby="today-h">
        <h2 id="today-h">{t('Today', 'Hoy')}</h2>
        <div className="kpis kpis-4">
          {kpi(t('New registrations today', 'Nuevos registros hoy'), k.newToday, undefined, true)}
          {kpi(t('People contacted today', 'Personas contactadas hoy'), k.contactsToday, goal(k.contactsToday, settings?.goal_contacts_day))}
          {kpi(t('Tasks due today', 'Tareas para hoy'), k.dueToday)}
          {kpi(t('Overdue follow-ups', 'Seguimientos vencidos'), k.overdueTasks, k.stale ? t(`${k.stale} without contact ${settings?.stale_days}+ days`, `${k.stale} sin contacto ${settings?.stale_days}+ días`) : undefined)}
        </div>
      </section>

      {alerts.length > 0 && (
        <Notice kind="error">
          <strong>{t('Low candidate pool', 'Pocos candidatos disponibles')}</strong>
          <ul className="plain">
            {alerts.map(a => <li key={a.opening.id}>{a.opening.title}: {t(`${a.pool} ready for ${a.needed} open spots`, `${a.pool} listos para ${a.needed} puestos abiertos`)}</li>)}
          </ul>
        </Notice>
      )}

      <section className="stack" aria-labelledby="funnel-h">
        <h2 id="funnel-h">{t('Funnel — people registered in the period', 'Embudo — personas registradas en el período')}</h2>
        <div className="kpis">
          {kpi(t('Registered', 'Registrados'), k.registered, t(`${k.total} in database`, `${k.total} en la base`), true)}
          {kpi(t('Contacted', 'Contactados'), k.contacted)}
          {kpi(t('Interested', 'Interesados'), k.interested)}
          {kpi(t('Pre-selected', 'Preseleccionados'), k.preselected)}
          {kpi(t('Completed process', 'Completaron el proceso'), k.completed)}
          {kpi(t('Confirmed starts', 'Incorporaciones confirmadas'), k.confirmedStarts)}
          {kpi(t('Interviews in period', 'Entrevistas en el período'), k.interviewsScheduled, t(`${k.upcomingInterviews} upcoming`, `${k.upcomingInterviews} próximas`))}
        </div>
      </section>

      <section className="stack" aria-labelledby="ret-h">
        <h2 id="ret-h">{t('Attendance and retention (from attendance records)', 'Asistencia y retención (según registros de asistencia)')}</h2>
        <div className="kpis kpis-5">
          {kpi(t('Authorized to work now', 'Autorizados para trabajar ahora'), k.authorized, undefined, true)}
          {kpi(t('First-day show rate', 'Asistencia al primer día'), k.showRate === null ? '—' : `${k.showRate}%`, t(`${k.firstDayShowed} of ${k.firstDayDue}`, `${k.firstDayShowed} de ${k.firstDayDue}`))}
          {k.retention.map(r => kpi(t(`Retention ${r.days} days`, `Retención ${r.days} días`), r.rate === null ? '—' : `${r.rate}%`,
            r.eligible ? t(`${r.retained} of ${r.eligible}`, `${r.retained} de ${r.eligible}`) : t('not enough data yet', 'aún sin datos suficientes')))}
        </div>
        <p className="small muted">{t('Retention counts only hires linked to the employee roster (“Add to roster” on the candidate). Average time to fill: ',
          'La retención solo cuenta contrataciones vinculadas a la lista de empleados (“Agregar” en el candidato). Tiempo promedio de cobertura: ')}
          {k.avgDaysToFill === null ? t('no openings filled in the period', 'ninguna vacante cubierta en el período') : t(`${k.avgDaysToFill} days (${k.filledOpenings} openings)`, `${k.avgDaysToFill} días (${k.filledOpenings} vacantes)`)}.</p>
      </section>

      <section className="panel flush" aria-labelledby="src-h">
        <div className="report-head pad">
          <div className="stack" style={{ gap: 4 }}>
            <h2 id="src-h">{t('Candidates and conversion by source', 'Candidatos y conversión por fuente')}</h2>
            <p className="small muted">{t('Conversion = started work ÷ registered. Cost appears only when a real monthly spend is entered on the source.',
              'Conversión = iniciaron trabajo ÷ registrados. El costo aparece solo si se registró un gasto mensual real en la fuente.')}</p>
          </div>
          {manage && <div className="row export">
            <button className="btn btn-ghost" onClick={() => exportSources('csv')}>CSV</button>
            <button className="btn btn-ghost" onClick={() => exportSources('xlsx')}>Excel</button>
            <button className="btn btn-ghost" onClick={() => exportSources('pdf')}>PDF</button>
          </div>}
        </div>
        <div className="table-scroll">
          <table className="report-table">
            <thead><tr>
              <th>{t('Source', 'Fuente')}</th><th className="num">{t('Registered', 'Registrados')}</th><th className="num">{t('Contacted', 'Contactados')}</th>
              <th className="num">{t('Pre-selected', 'Preselecc.')}</th><th className="num">{t('Approved', 'Aprobados')}</th><th className="num">{t('Started', 'Iniciaron')}</th>
              <th className="num">{t('Conversion', 'Conversión')}</th><th className="num">{t('Cost / candidate', 'Costo / candidato')}</th>
            </tr></thead>
            <tbody>
              {sources.length ? sources.map(s => (
                <tr key={s.id ?? 'none'}>
                  <td>{s.name}</td><td className="num">{s.registered}</td><td className="num">{s.contacted}</td><td className="num">{s.preselected}</td>
                  <td className="num">{s.authorized}</td><td className="num">{s.started}</td>
                  <td className="num">{s.conversion === null ? '—' : `${s.conversion}%`}</td>
                  <td className="num">{s.costPerCandidate === null ? '—' : `$${s.costPerCandidate.toFixed(2)}`}</td>
                </tr>
              )) : <tr><td colSpan={8} className="muted">{t('No registrations in this period.', 'Sin registros en este período.')}</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <div className="two">
        <section className="panel">
          <h2>{t('Pipeline now', 'Pipeline actual')}</h2>
          <ul className="phase-list">
            {PHASES.map(p => {
              const n = filtered.filter(c => phaseOf(c.stage) === p.key).length;
              return <li key={p.key}><Link to={`/recruiting/candidates?phase=${p.key}`}><strong>{n}</strong> {p[lang]}</Link><span className="small muted">{p.hint[lang]}</span></li>;
            })}
          </ul>
        </section>
        <section className="panel">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h2>{t('Next tasks', 'Próximas tareas')}</h2>
            <Link className="small" to="/recruiting/tasks">{t('All tasks', 'Todas')}</Link>
          </div>
          {tasks.length ? (
            <ul className="task-list">
              {tasks.slice(0, 8).map(task => (
                <li key={task.id}>
                  <span className={task.due_on < today ? 't-absent' : task.due_on === today ? 't-none' : 'muted'}>{task.due_on}</span>{' '}
                  {task.candidate_id ? <Link to={`/recruiting/candidates/${task.candidate_id}`}>{task.title}</Link> : task.title}
                </li>
              ))}
            </ul>
          ) : <p className="muted">{t('Nothing pending.', 'Nada pendiente.')}</p>}
        </section>
      </div>
      <p className="small muted">{t('Shift and position filters use the availability candidates gave. Every number comes from stored records.',
        'Los filtros de turno y puesto usan la disponibilidad que dieron los candidatos. Cada cifra sale de registros guardados.')}</p>
    </div>
  );
}
