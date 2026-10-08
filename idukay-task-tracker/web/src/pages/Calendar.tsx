import { useMemo, useState } from 'react';
import { useFamily } from '../lib/family';
import { useT } from '../lib/i18n';
import { addDays, byDueThenCreated, capFirst, fmtLong, isDone, mondayOf, parseIso, todayIso, toIso } from '../lib/dates';
import type { Task } from '../lib/types';
import { ChildSwitcher } from '../components/ChildSwitcher';
import { IconChevL, IconChevR } from '../components/Icons';
import { Spinner, useSticky } from '../components/ui';
import { ByChild } from './Lists';

// 🟢 completed · 🟡 pending today · 🔴 overdue · 🔵 upcoming
type Mark = 'green' | 'yellow' | 'red' | 'blue';
function markOf(x: Task, today: string): Mark {
  if (isDone(x)) return 'green';
  if (!x.due_date || x.due_date > today) return 'blue';
  return x.due_date === today ? 'yellow' : 'red';
}

export function CalendarPage() {
  const fam = useFamily();
  const { t } = useT();
  const today = todayIso();
  const [month, setMonth] = useState(() => today.slice(0, 7));
  const [day, setDay] = useState(today);

  const first = `${month}-01`;
  const gridStart = mondayOf(first);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const weeks = cells[35].slice(0, 7) === month ? 6 : 5;

  const byDay = useMemo(() => {
    const m = new Map<string, Task[]>();
    for (const x of fam.visibleTasks) if (x.due_date) m.set(x.due_date, [...(m.get(x.due_date) ?? []), x]);
    return m;
  }, [fam.visibleTasks]);
  const sorted = useMemo(() => [...fam.visibleTasks].sort(byDueThenCreated), [fam.visibleTasks]);
  const list = useSticky(sorted, x => x.due_date === day, `${day}|${fam.selected}`);

  const go = (delta: number) => {
    const d = parseIso(first); d.setMonth(d.getMonth() + delta);
    setMonth(toIso(d).slice(0, 7));
  };
  if (fam.loading) return <Spinner />;
  const title = capFirst(new Intl.DateTimeFormat(t.locale, { month: 'long', year: 'numeric' }).format(parseIso(first)));
  const dows = [0, 1, 2, 3, 4, 5, 6].map(i => new Intl.DateTimeFormat(t.locale, { weekday: 'narrow' }).format(parseIso(addDays(gridStart, i))));

  return (
    <div className="stack">
      <div className="spread">
        <h1>{title}</h1>
        <div className="row">
          <button type="button" className="icon-btn" onClick={() => go(-1)} aria-label={t.calendar.prev}><IconChevL /></button>
          <button type="button" className="icon-btn" onClick={() => go(1)} aria-label={t.calendar.next}><IconChevR /></button>
        </div>
      </div>
      <ChildSwitcher />
      <div className="card card-pad">
        <div className="cal-grid" role="grid">
          {dows.map((d, i) => <div key={i} className="cal-dow">{d}</div>)}
          {cells.slice(0, weeks * 7).map(d => {
            const ts = byDay.get(d) ?? [];
            const marks = [...new Set(ts.map(x => markOf(x, today)))].sort();
            return (
              <button type="button" key={d} data-day={d} aria-pressed={d === day}
                aria-label={`${fmtLong(d, t.locale)}: ${ts.length}`}
                className={`cal-day${d.slice(0, 7) !== month ? ' out' : ''}${d === today ? ' today' : ''}${d === day ? ' selected' : ''}`}
                onClick={() => setDay(d)}>
                <span className="dn">{parseIso(d).getDate()}</span>
                <span className="cal-dots">{marks.map(m => <i key={m} className={`dot ${m}`} />)}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="legend">
        <span><i className="dot green" />{t.calendar.legend.completed}</span>
        <span><i className="dot yellow" />{t.calendar.legend.pending}</span>
        <span><i className="dot red" />{t.calendar.legend.overdue}</span>
        <span><i className="dot blue" />{t.calendar.legend.upcoming}</span>
      </div>
      <h2>{fmtLong(day, t.locale)}</h2>
      <ByChild tasks={list} empty={t.calendar.empty} />
    </div>
  );
}
