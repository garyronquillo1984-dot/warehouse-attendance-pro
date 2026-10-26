import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useLang } from '../../lib/i18n';
import { addDays } from '../../lib/time';
import { friendlyError } from '../../lib/errors';
import type { Task } from '../../lib/recruiting';
import { Field, Loading, Notice } from '../../components/ui';
import { useRecruiting } from './Layout';

const KINDS: Record<string, [string, string]> = {
  first_contact: ['First contact', 'Primer contacto'], follow_up: ['Follow-up', 'Seguimiento'], prescreen: ['Pre-screen', 'Preselección'],
  interview: ['Interview', 'Entrevista'], confirm_first_day: ['Confirm first day', 'Confirmar primer día'],
  first_day_check: ['First-day check', 'Verificar primer día'], retention_check: ['Retention check-in', 'Seguimiento de retención'],
  recontact: ['Recontact', 'Recontactar'], event_follow_up: ['Event follow-up', 'Seguimiento de evento'], other: ['Other', 'Otro'],
};

export default function Tasks() {
  const { org, manage, setup, today } = useRecruiting();
  const { t, lang } = useLang();
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [mine, setMine] = useState(false);
  const [me, setMe] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [due, setDue] = useState(today);

  async function load() {
    let q = supabase.from('recruitment_tasks').select('*').eq('organization_id', org.organization_id).order('due_on').limit(3000);
    q = showDone ? q.gte('due_on', addDays(today, -30)) : q.is('done_at', null);
    const { data, error } = await q;
    if (error) setErr(friendlyError(error));
    setTasks((data ?? []) as Task[]);
  }
  useEffect(() => { load(); }, [showDone]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { supabase.auth.getUser().then(({ data }) => setMe(data.user?.id ?? null)); }, []);

  const groups = useMemo(() => {
    const list = (tasks ?? []).filter(x => !mine || x.assigned_to === me);
    return [
      [t('Overdue', 'Vencidas'), list.filter(x => !x.done_at && x.due_on < today)],
      [t('Today', 'Hoy'), list.filter(x => !x.done_at && x.due_on === today)],
      [t('Next 7 days', 'Próximos 7 días'), list.filter(x => !x.done_at && x.due_on > today && x.due_on <= addDays(today, 7))],
      [t('Later', 'Más adelante'), list.filter(x => !x.done_at && x.due_on > addDays(today, 7))],
      [t('Done (last 30 days)', 'Hechas (últimos 30 días)'), list.filter(x => x.done_at)],
    ] as [string, Task[]][];
  }, [tasks, mine, me, today, lang]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!tasks) return <Loading label={t('Loading…', 'Cargando…')} />;

  async function toggle(x: Task) {
    const { error } = await supabase.from('recruitment_tasks').update({ done_at: x.done_at ? null : new Date().toISOString() }).eq('id', x.id);
    if (error) setErr(friendlyError(error)); else load();
  }
  async function add(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    const { error } = await supabase.from('recruitment_tasks').insert({ organization_id: org.organization_id, kind: 'other', title: title.trim(), due_on: due, assigned_to: me });
    if (error) setErr(friendlyError(error)); else { setTitle(''); load(); }
  }
  const who = (id: string | null) => setup.members.find(m => m.user_id === id)?.name;

  return (
    <div className="stack-lg narrow">
      <div className="page-head">
        <h1>{t('Tasks and reminders', 'Tareas y recordatorios')}</h1>
        <p className="muted">{t('Created automatically as candidates move (first contact, pre-screen, interview, first day, 7/30/60-day check-ins, recontact).',
          'Se crean automáticamente cuando los candidatos avanzan (primer contacto, preselección, entrevista, primer día, seguimiento a 7/30/60 días, recontacto).')}</p>
      </div>
      {err && <Notice kind="error">{err}</Notice>}
      <div className="chips">
        <button className="chip" aria-pressed={mine} onClick={() => setMine(!mine)}>{t('Assigned to me', 'Asignadas a mí')}</button>
        <button className="chip" aria-pressed={showDone} onClick={() => setShowDone(!showDone)}>{t('Show done', 'Mostrar hechas')}</button>
      </div>
      {groups.filter(([, l]) => l.length).map(([name, l]) => (
        <section key={name} className="panel">
          <h2>{name} <span className="muted">{l.length}</span></h2>
          <ul className="task-list">
            {l.map(x => (
              <li key={x.id} data-done={!!x.done_at || undefined}>
                <label className="check">
                  <input type="checkbox" checked={!!x.done_at} onChange={() => toggle(x)} />
                  <span>
                    {x.candidate_id ? <Link to={`/recruiting/candidates/${x.candidate_id}`}>{x.title}</Link> : x.title}
                    <span className="small muted"> · {x.due_on} · {(KINDS[x.kind] ?? KINDS.other)[lang === 'es' ? 1 : 0]}{who(x.assigned_to) ? ` · ${who(x.assigned_to)}` : ''}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {!groups.some(([, l]) => l.length) && <p className="muted">{t('Nothing pending.', 'Nada pendiente.')}</p>}
      {manage && (
        <form className="panel" onSubmit={add}>
          <h2>{t('Add a general task', 'Agregar una tarea general')}</h2>
          <div className="row" style={{ alignItems: 'end' }}>
            <div className="field" style={{ flex: '1 1 260px' }}>
              <label htmlFor="gt">{t('Task', 'Tarea')}</label>
              <input id="gt" value={title} maxLength={160} onChange={e => setTitle(e.target.value)} placeholder={t('e.g. Call Kentucky Career Center about job fair', 'p. ej. Llamar al Kentucky Career Center por la feria')} />
            </div>
            <Field label={t('Due', 'Fecha')} name="gdue" type="date" value={due} onChange={e => setDue(e.target.value)} />
            <button className="btn btn-primary">{t('Add', 'Agregar')}</button>
          </div>
        </form>
      )}
    </div>
  );
}
