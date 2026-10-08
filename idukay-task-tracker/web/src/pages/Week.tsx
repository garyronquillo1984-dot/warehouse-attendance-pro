import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useFamily } from '../lib/family';
import { useT } from '../lib/i18n';
import { addDays, byDueThenCreated, fmtDate, fmtLong, isDone, isOverdue, mondayOf, parseIso, todayIso } from '../lib/dates';
import type { Task } from '../lib/types';
import { ChildSwitcher } from '../components/ChildSwitcher';
import { IconChevL, IconChevR } from '../components/Icons';
import { Spinner, useSticky } from '../components/ui';
import { ByChild } from './Lists';

type View = 'day' | 'tomorrow' | 'week' | 'overdue';

// Monday–Friday at a glance: tasks per day and how many are left. Pick a day to see its tasks.
export function WeekPage() {
  const fam = useFamily();
  const { t } = useT();
  const today = todayIso();
  const [params, setParams] = useSearchParams();
  const [monday, setMonday] = useState(() => mondayOf(params.get('day') ?? today));
  const [day, setDay] = useState(params.get('day') ?? (isWeekend(today) ? addDays(mondayOf(today), 7) : today));
  const [view, setView] = useState<View>('day');

  const days = [0, 1, 2, 3, 4].map(i => addDays(monday, i));
  const weekend = [addDays(monday, 5), addDays(monday, 6)];
  const byDay = useMemo(() => {
    const m = new Map<string, Task[]>();
    for (const x of fam.visibleTasks) if (x.due_date) m.set(x.due_date, [...(m.get(x.due_date) ?? []), x]);
    return m;
  }, [fam.visibleTasks]);
  const weekendCount = weekend.reduce((n, d) => n + (byDay.get(d)?.length ?? 0), 0);

  const sorted = useMemo(() => [...fam.visibleTasks].sort(byDueThenCreated), [fam.visibleTasks]);
  const tomorrow = addDays(today, 1);
  const match = (x: Task) =>
    view === 'day' ? x.due_date === day
    : view === 'tomorrow' ? x.due_date === tomorrow
    : view === 'overdue' ? isOverdue(x, today)
    : !!x.due_date && x.due_date >= monday && x.due_date <= addDays(monday, 6);
  const list = useSticky(sorted, match, `${view}|${day}|${monday}|${fam.selected}`);

  const pick = (d: string) => { setDay(d); setView('day'); setParams({ day: d }, { replace: true }); };
  const shift = (weeks: number) => { const m = addDays(monday, 7 * weeks); setMonday(m); pick(m); };

  if (fam.loading) return <Spinner />;
  const heading = view === 'day' ? fmtLong(day, t.locale) : view === 'tomorrow' ? t.week.chips.tomorrow : view === 'overdue' ? t.week.chips.overdue : t.week.chips.week;

  return (
    <div className="stack">
      <div className="spread">
        <div className="page-head"><h1>{t.week.title}</h1>
          <p className="muted">{fmtDate(monday, t.locale, { day: 'numeric', month: 'short' })} – {fmtDate(addDays(monday, 4), t.locale, { day: 'numeric', month: 'short' })}</p></div>
        <div className="row">
          <button type="button" className="icon-btn" onClick={() => shift(-1)} aria-label={t.week.prev}><IconChevL /></button>
          <button type="button" className="icon-btn" onClick={() => shift(1)} aria-label={t.week.next}><IconChevR /></button>
        </div>
      </div>
      <ChildSwitcher />

      <div className="week-strip" data-testid="week-strip">
        {days.map(d => {
          const ts = byDay.get(d) ?? [];
          const left = ts.filter(x => !isDone(x)).length;
          const pct = ts.length ? ((ts.length - left) / ts.length) * 100 : 0;
          return (
            <button type="button" key={d} className={`day-btn${d === today ? ' today' : ''}${view === 'day' && d === day ? ' selected' : ''}`}
              onClick={() => pick(d)} aria-pressed={view === 'day' && d === day} data-day={d}>
              <span className="dow">{fmtDate(d, t.locale, { weekday: 'short' }).replace('.', '')}</span>
              <span className="dn">{parseIso(d).getDate()}</span>
              <span className="cnt">{t.week.tasks(ts.length)}</span>
              <span className="bar"><div style={{ width: `${pct}%` }} /></span>
            </button>
          );
        })}
      </div>

      <div className="row-wrap">
        <button type="button" className={`chip${view === 'day' && day === today ? ' active' : ''}`} onClick={() => { setMonday(mondayOf(today)); pick(today); }}>{t.week.chips.today}</button>
        <button type="button" className={`chip${view === 'tomorrow' ? ' active' : ''}`} onClick={() => setView('tomorrow')}>{t.week.chips.tomorrow}</button>
        <button type="button" className={`chip${view === 'week' ? ' active' : ''}`} onClick={() => setView('week')}>{t.week.chips.week}</button>
        <button type="button" className={`chip${view === 'overdue' ? ' active' : ''}`} onClick={() => setView('overdue')}>{t.week.chips.overdue}</button>
        {weekendCount > 0 && <button type="button" className={`chip${view === 'day' && weekend.includes(day) ? ' active' : ''}`} onClick={() => pick(weekend[0])}>{t.week.weekend} · {weekendCount}</button>}
      </div>

      <h2>{heading}</h2>
      <ByChild tasks={list} empty={t.week.empty} />
    </div>
  );
}

const isWeekend = (d: string) => { const w = parseIso(d).getDay(); return w === 0 || w === 6; };
