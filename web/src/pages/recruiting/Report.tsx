import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useLang } from '../../lib/i18n';
import { addDays, isoWeekday } from '../../lib/time';
import { friendlyError } from '../../lib/errors';
import { STAGES, stageLabel, inPool, atLeast, type Stage } from '../../lib/recruiting';
import { bySource, computeKpis, lowPool } from '../../lib/recruitingMetrics';
import { Loading, Notice } from '../../components/ui';
import { useRecruiting } from './Layout';
import { useCandidates, useOpenTasks, exportTable } from './data';
import { useActivity } from './Dashboard';

// Daily and weekly report for the supervisor: activity, results against goals, openings,
// channels and coordination. Copy as text for an email, or export to PDF / Excel.
export default function Report() {
  const { org, manage, setup, today } = useRecruiting();
  const { t, lang } = useLang();
  const [kind, setKind] = useState<'daily' | 'weekly'>('daily');
  const [day, setDay] = useState(today);
  const from = kind === 'daily' ? day : addDays(day, 1 - isoWeekday(day));
  const to = kind === 'daily' ? day : addDays(from, 6) > today ? today : addDays(from, 6);
  const { list } = useCandidates(org.organization_id);
  const { tasks } = useOpenTasks(org.organization_id);
  const act = useActivity(org.organization_id, addDays(from, -1));
  const [coord, setCoord] = useState<{ kind: string; status: string; title: string }[]>([]);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    supabase.from('coordination_entries').select('kind, status, title').eq('organization_id', org.organization_id)
      .gte('occurred_on', from).lte('occurred_on', to).then(({ data }) => setCoord(data ?? []));
  }, [org.organization_id, from, to]);

  const s = setup.settings;
  const f = { from, to };
  const k = useMemo(() => list && act && tasks && computeKpis({ all: list, filtered: list, stageEvents: act.stageEvents, contacts: act.contacts,
    outcomes: act.outcomes, tasks, openings: setup.openings, f, today, staleDays: s?.stale_days ?? 3 }), [list, act, tasks, from, to]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!list || !act || !tasks || !k) return <Loading label={t('Loading…', 'Cargando…')} />;

  const days = kind === 'daily' ? 1 : Math.max(1, Math.round((Date.parse(to) - Date.parse(from)) / 864e5) + 1);
  const inP = (iso: string) => iso.slice(0, 10) >= from && iso.slice(0, 10) <= to;
  const contacts = act.contacts.filter(e => inP(e.created_at));
  const moves = new Map<Stage, number>();
  act.stageEvents.filter(e => e.stage_to && inP(e.created_at)).forEach(e => moves.set(e.stage_to!, (moves.get(e.stage_to!) ?? 0) + 1));
  const prescreens = moves.get('prescreened') ?? 0;
  const noShows = list.filter(c => c.closed_reason === 'no_show' && inP(c.stage_changed_at)).length;
  const hasSamples = list.some(c => c.is_sample);
  const goalContacts = (s?.goal_contacts_day ?? 0) * (kind === 'daily' ? 1 : Math.min(days, 5));
  const goalPrescreens = kind === 'weekly' ? s?.goal_prescreens_week ?? 0 : Math.ceil((s?.goal_prescreens_week ?? 0) / 5);
  const goalInterviews = kind === 'weekly' ? s?.goal_interviews_week ?? 0 : Math.ceil((s?.goal_interviews_week ?? 0) / 5);
  const sources = bySource(list, act.stageEvents, setup.sources, f).slice(0, 8);
  const alerts = lowPool(list, setup.openings, s?.low_pool_threshold ?? 3);
  const authorized = setup.openings.filter(o => o.status === 'authorized');

  const rows: [string, string | number, string][] = [
    [t('New registrations', 'Nuevos registros'), k.registered, ''],
    [t('People contacted', 'Personas contactadas'), new Set(contacts.map(c => c.candidate_id)).size, goalContacts ? `${t('goal', 'meta')} ${goalContacts}` : ''],
    [t('Contact attempts logged', 'Intentos de contacto registrados'), contacts.length, ''],
    [t('Moved to pre-selected', 'Pasaron a preselección'), prescreens, goalPrescreens ? `${t('goal', 'meta')} ${goalPrescreens}` : ''],
    [t('Interviews / appointments in period', 'Entrevistas / citas en el período'), k.interviewsScheduled, goalInterviews ? `${t('goal', 'meta')} ${goalInterviews}` : ''],
    [t('Approved by hiring process', 'Aprobados por el proceso'), moves.get('approved') ?? 0, ''],
    [t('First days confirmed', 'Primeros días confirmados'), moves.get('first_day_confirmed') ?? 0, ''],
    [t('Showed up to work (first day)', 'Se presentaron (primer día)'), moves.get('started') ?? 0, ''],
    [t('No-shows recorded', 'No se presentaron'), noShows, ''],
    [t('First-day show rate', 'Asistencia al primer día'), k.showRate === null ? '—' : `${k.showRate}%`, s ? `${t('goal', 'meta')} ${s.goal_show_rate}%` : ''],
    [t('30-day retention', 'Retención a 30 días'), k.retention[1].rate === null ? '—' : `${k.retention[1].rate}%`, s ? `${t('goal', 'meta')} ${s.goal_retention_30}%` : ''],
    [t('Authorized to work, not yet placed', 'Autorizados, aún sin colocar'), list.filter(c => ['approved', 'available'].includes(c.stage)).length, ''],
    [t('Overdue follow-ups now', 'Seguimientos vencidos ahora'), k.overdueTasks, ''],
    [t('Candidates without contact', 'Candidatos sin contacto'), k.stale, `${s?.stale_days ?? 3}+ ${t('days', 'días')}`],
    [t('Agency coordination entries', 'Registros de coordinación'), coord.length, `${coord.filter(c => c.kind === 'escalation').length} ${t('escalations', 'escalamientos')}`],
  ];
  const openingRows = authorized.map(o => {
    const placed = list.filter(c => c.opening_id === o.id && atLeast(c.stage, 'assigned')).length;
    return [o.title, o.headcount, placed, list.filter(c => inPool(c, o)).length];
  });
  const period = from === to ? from : `${from} → ${to}`;
  const title = kind === 'daily' ? t('Daily recruiting report', 'Reporte diario de reclutamiento') : t('Weekly recruiting report', 'Reporte semanal de reclutamiento');

  const text = [
    `${title} — ${org.name} — ${period}`,
    hasSamples ? t('NOTE: includes SAMPLE data (not real results).', 'NOTA: incluye datos de EJEMPLO (no son resultados reales).') : '',
    '',
    ...rows.map(([a, b, c]) => `• ${a}: ${b}${c ? ` (${c})` : ''}`),
    '',
    t('Authorized openings (needed / placed / ready pool):', 'Vacantes autorizadas (necesarias / colocadas / grupo listo):'),
    ...(openingRows.length ? openingRows.map(r => `• ${r[0]}: ${r[1]} / ${r[2]} / ${r[3]}`) : [t('• none recorded', '• ninguna registrada')]),
    ...(alerts.length ? ['', t('Attention — low pool:', 'Atención — pocos candidatos:'), ...alerts.map(a => `• ${a.opening.title}: ${a.pool} ${t('ready for', 'listos para')} ${a.needed}`)] : []),
    '',
    t('Top sources this period (registered → started):', 'Principales fuentes del período (registrados → iniciaron):'),
    ...(sources.length ? sources.map(x => `• ${x.name}: ${x.registered} → ${x.started}`) : [t('• no registrations', '• sin registros')]),
  ].filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n');

  async function doExport(fmt: 'pdf' | 'xlsx') {
    setErr(null);
    try {
      await exportTable(org.organization_id, fmt, {
        title, description: '', numeric: [1],
        columns: [t('Indicator', 'Indicador'), t('Value', 'Valor'), t('Goal / note', 'Meta / nota')],
        rows: [...rows, ['', '', ''], [t('OPENINGS (needed / placed / pool)', 'VACANTES (necesarias / colocadas / grupo)'), '', ''],
          ...openingRows.map(r => [String(r[0]), `${r[1]} / ${r[2]} / ${r[3]}`, '']),
          ['', '', ''], [t('SOURCES (registered → started)', 'FUENTES (registrados → iniciaron)'), '', ''],
          ...sources.map(x => [x.name, `${x.registered} → ${x.started}`, x.conversion === null ? '' : `${x.conversion}%`])],
      }, { company: org.name, scope: hasSamples ? 'INCLUDES SAMPLE DATA' : t('Recruiting', 'Reclutamiento'), period, from, to });
    } catch (e) { setErr(friendlyError(e)); }
  }

  return (
    <div className="stack-lg narrow">
      <div className="page-head">
        <h1>{t('Reports for my supervisor', 'Reportes para mi supervisor')}</h1>
        <p className="muted">{t('Activity and results, never promises. Numbers come from the records in this app.', 'Actividad y resultados, nunca promesas. Las cifras salen de los registros de esta aplicación.')}</p>
      </div>
      {err && <Notice kind="error">{err}</Notice>}
      {hasSamples && <Notice kind="info">{t('Sample data is loaded and included. Remove it from the Dashboard before sending a real report.', 'Hay datos de ejemplo incluidos. Elimínalos desde el Panel antes de enviar un reporte real.')}</Notice>}
      <div className="filters">
        <div className="chips">
          <button className="chip" aria-pressed={kind === 'daily'} onClick={() => setKind('daily')}>{t('Daily', 'Diario')}</button>
          <button className="chip" aria-pressed={kind === 'weekly'} onClick={() => setKind('weekly')}>{t('Weekly', 'Semanal')}</button>
        </div>
        <div className="field"><label htmlFor="r-day">{kind === 'daily' ? t('Day', 'Día') : t('Any day of the week', 'Cualquier día de la semana')}</label>
          <input id="r-day" type="date" value={day} max={today} onChange={e => setDay(e.target.value || today)} /></div>
      </div>
      <section className="panel">
        <h2>{title}</h2>
        <p className="muted small">{org.name} · {period}</p>
        <table className="report-table">
          <tbody>{rows.map(([a, b, c]) => <tr key={a}><td>{a}</td><td className="num"><strong>{b}</strong></td><td className="small muted">{c}</td></tr>)}</tbody>
        </table>
        <h3>{t('Stage movements in the period', 'Movimientos de etapa en el período')}</h3>
        <p className="small">{STAGES.filter(x => moves.get(x.key)).map(x => `${stageLabel(x.key, lang, s)}: ${moves.get(x.key)}`).join(' · ') || '—'}</p>
      </section>
      <section className="panel">
        <h2>{t('Text for email or chat', 'Texto para correo o chat')}</h2>
        <pre className="message-preview">{text}</pre>
        <div className="row">
          <button className="btn btn-primary" onClick={async () => { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? t('Copied', 'Copiado') : t('Copy report', 'Copiar reporte')}</button>
          {manage && <button className="btn btn-ghost" onClick={() => doExport('pdf')}>PDF</button>}
          {manage && <button className="btn btn-ghost" onClick={() => doExport('xlsx')}>Excel</button>}
        </div>
        <p className="small muted">{t('The report contains counts only, no candidate names or contact details.', 'El reporte contiene solo cantidades, sin nombres ni datos de contacto de candidatos.')}</p>
      </section>
    </div>
  );
}
