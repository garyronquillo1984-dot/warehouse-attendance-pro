// Today, Overdue and Completed lists.
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useFamily } from '../lib/family';
import { useT } from '../lib/i18n';
import { byDueThenCreated, fmtLong, inTodaysWork, isDone, isOverdue, localDay, todayIso } from '../lib/dates';
import type { Child, Task } from '../lib/types';
import { ChildSwitcher } from '../components/ChildSwitcher';
import { TaskList } from '../components/TaskList';
import { Empty, Spinner, useSticky } from '../components/ui';
import { ProgressCard } from './Dashboard';

// Tasks grouped under each child's coloured header (when showing several children).
export function ByChild({ tasks, empty }: { tasks: Task[]; empty: string }) {
  const fam = useFamily();
  const { t } = useT();
  if (!tasks.length) return <Empty icon="🎉">{empty}</Empty>;
  const groups = fam.selected === 'all' && fam.activeChildren.length > 1
    ? fam.activeChildren.map(c => [c, tasks.filter(x => x.child_id === c.id)] as [Child, Task[]]).filter(([, ts]) => ts.length)
    : [[fam.childById.get(tasks[0].child_id)!, tasks] as [Child, Task[]]];
  return (
    <>
      {groups.map(([c, ts]) => (
        <section key={c?.id ?? 'x'} className="card" data-testid={`group-${c?.name}`}>
          {c && <div className="group-head"><h3><i className="kid-dot" style={{ background: c.color, width: 10, height: 10 }} />{c.name}</h3>
            <span className="count">{t.dashboard.doneOf(ts.filter(isDone).length, ts.length)}</span></div>}
          <TaskList tasks={ts} showChild={false} />
        </section>
      ))}
    </>
  );
}

export function TodayPage() {
  const fam = useFamily();
  const { t } = useT();
  const today = todayIso();
  const sorted = useMemo(() => [...fam.visibleTasks].sort(byDueThenCreated), [fam.visibleTasks]);
  const list = useSticky(sorted, x => inTodaysWork(x, today), fam.selected);
  if (fam.loading) return <Spinner />;
  return (
    <div className="stack">
      <div className="page-head"><h1>{t.today.title}</h1><p className="muted">{fmtLong(today, t.locale)} · {t.today.subtitle}</p></div>
      <ChildSwitcher />
      <ProgressCard tasks={fam.visibleTasks} today={today} />
      <ByChild tasks={list} empty={t.today.empty} />
    </div>
  );
}

export function OverduePage() {
  const fam = useFamily();
  const { t } = useT();
  const today = todayIso();
  const sorted = useMemo(() => [...fam.visibleTasks].sort(byDueThenCreated), [fam.visibleTasks]);
  const list = useSticky(sorted, x => isOverdue(x, today), fam.selected);
  if (fam.loading) return <Spinner />;
  return (
    <div className="stack">
      <div className="page-head"><h1>{t.overdue.title}</h1><p className="muted">{t.overdue.subtitle}</p></div>
      <ChildSwitcher />
      <ByChild tasks={list} empty={t.overdue.empty} />
    </div>
  );
}

const PAGE = 50;

// Everything completed, newest first, grouped by the day it was completed. Pages through
// the database so years of history stay fast.
export function CompletedPage() {
  const fam = useFamily();
  const { t } = useT();
  const [rows, setRows] = useState<Task[]>([]);
  const [more, setMore] = useState(true);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState('');

  const load = async (from: number) => {
    setBusy(true);
    let query = supabase.from('tasks')
      .select('id, child_id, subject, subject_id, title, description, assigned_date, due_date, due_time, priority, status, estimated_minutes, teacher, notes, source, completed_at, created_at, updated_at')
      .eq('status', 'completed').order('completed_at', { ascending: false }).range(from, from + PAGE - 1);
    if (fam.selected !== 'all') query = query.eq('child_id', fam.selected);
    const { data } = await query;
    const got = (data ?? []) as Task[];
    setRows(r => (from === 0 ? got : [...r, ...got]));
    setMore(got.length === PAGE);
    setBusy(false);
  };
  useEffect(() => { void load(0); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [fam.selected]);

  // Ticks made on this page update the shared store; show those states here too.
  const live = rows.map(r => fam.tasks.find(x => x.id === r.id) ?? r);
  const needle = q.trim().toLowerCase();
  const shown = needle ? live.filter(x => [x.title, x.subject, x.teacher, x.description, fam.childById.get(x.child_id)?.name].join(' ').toLowerCase().includes(needle)) : live;
  const groups = new Map<string, Task[]>();
  for (const x of shown) {
    const day = localDay(x.completed_at) ?? '—';
    groups.set(day, [...(groups.get(day) ?? []), x]);
  }

  return (
    <div className="stack">
      <div className="page-head"><h1>{t.completed.title}</h1></div>
      <ChildSwitcher />
      <input className="input" type="search" placeholder={t.completed.searchPh} value={q} onChange={e => setQ(e.target.value)} aria-label={t.common.search} />
      {busy && rows.length === 0 ? <Spinner /> : shown.length === 0 ? <Empty icon="✅">{needle ? t.completed.noResults : t.completed.empty}</Empty> : (
        [...groups].map(([day, ts]) => (
          <section key={day} className="card">
            <div className="group-head"><h3>{day === '—' ? '—' : fmtLong(day, t.locale)}</h3><span className="count">{ts.length}</span></div>
            <TaskList tasks={ts} />
          </section>
        ))
      )}
      {more && rows.length > 0 && !needle && <button type="button" className="btn secondary" disabled={busy} onClick={() => load(rows.length)}>{t.common.loadMore}</button>}
    </div>
  );
}

