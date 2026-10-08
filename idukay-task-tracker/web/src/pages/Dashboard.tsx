import { Link } from 'react-router-dom';
import { useAccount } from '../lib/account';
import { useFamily } from '../lib/family';
import { useT } from '../lib/i18n';
import { addDays, byDueThenCreated, fmtLong, inTodaysWork, isDone, isOverdue, todayIso } from '../lib/dates';
import type { Task } from '../lib/types';
import { ChildSwitcher } from '../components/ChildSwitcher';
import { TaskList } from '../components/TaskList';
import { TrialBanner } from '../components/TrialBanner';
import { Empty, Spinner, useSticky } from '../components/ui';

export function summarize(tasks: Task[], today: string) {
  const tomorrow = addDays(today, 1);
  const work = tasks.filter(t => inTodaysWork(t, today));
  const done = work.filter(isDone).length;
  return {
    work,
    total: work.length,
    done,
    pending: work.length - done,
    overdue: tasks.filter(t => isOverdue(t, today)).length,
    tomorrow: tasks.filter(t => t.due_date === tomorrow && !isDone(t)).length,
    pct: work.length ? Math.round((done / work.length) * 100) : 0,
  };
}

export function ProgressCard({ tasks, today }: { tasks: Task[]; today: string }) {
  const { t } = useT();
  const s = summarize(tasks, today);
  return (
    <div className="card card-pad stack-sm" data-testid="progress">
      <div className="spread"><h3>{t.dashboard.progress}</h3><strong className="num">{s.done}/{s.total}</strong></div>
      <div className="progress" role="progressbar" aria-valuenow={s.pct} aria-valuemin={0} aria-valuemax={100}><div style={{ width: `${s.pct}%` }} /></div>
      <div className="small muted">{s.total ? t.dashboard.progressPct(s.pct) : t.dashboard.nothingToday}</div>
    </div>
  );
}

export function DashboardPage() {
  const { account } = useAccount();
  const fam = useFamily();
  const { t } = useT();
  const today = todayIso();
  const tomorrow = addDays(today, 1);
  const hour = new Date().getHours();
  const greet = hour < 12 ? t.greeting.morning : hour < 19 ? t.greeting.afternoon : t.greeting.evening;
  const firstName = account?.full_name.split(' ')[0] ?? '';

  const sorted = [...fam.visibleTasks].sort(byDueThenCreated);
  const todayList = useSticky(sorted, x => inTodaysWork(x, today) && !isDone(x), fam.selected);
  const tomorrowList = useSticky(sorted, x => x.due_date === tomorrow && !isDone(x), fam.selected);

  if (fam.loading) return <Spinner />;
  const kids = fam.selected === 'all' ? fam.activeChildren : fam.activeChildren.filter(c => c.id === fam.selected);

  return (
    <div className="stack">
      <div className="page-head">
        <h1>{greet}, {firstName} 👋</h1>
        <p className="muted">{t.dashboard.todayTitle} · {fmtLong(today, t.locale)}</p>
      </div>
      <TrialBanner />
      <ChildSwitcher />

      {fam.activeChildren.length === 0 ? (
        <Empty icon="👧" action={<Link className="btn" to="/app/children">{t.dashboard.addChild}</Link>}>{t.dashboard.noChildren}</Empty>
      ) : (
        <>
          <ProgressCard tasks={fam.visibleTasks} today={today} />

          {kids.map(c => {
            const s = summarize(fam.tasks.filter(x => x.child_id === c.id), today);
            return (
              <div key={c.id} className="kid-card" data-testid={`kid-${c.name}`}>
                <div className="kid-head" style={{ background: `color-mix(in srgb, ${c.color} 14%, var(--surface))` }}>
                  <div className="kid-name"><h3 style={{ color: c.color }}>{c.name}</h3>{c.grade && <span className="small muted">{c.grade}</span>}</div>
                  {s.overdue > 0 && <Link to="/app/overdue" className="pill overdue">{t.dashboard.overdue(s.overdue)}</Link>}
                </div>
                <div className="kid-stats" style={{ paddingTop: 12 }}>
                  <span><i className="dot red" />{t.dashboard.pendingN(s.pending)}</span>
                  <span><i className="dot green" />{t.dashboard.completedN(s.done)}</span>
                  <span><i className="dot yellow" />{t.dashboard.tomorrowN(s.tomorrow)}</span>
                </div>
              </div>
            );
          })}

          <section className="card" aria-labelledby="next-up">
            <div className="card-head"><h3 id="next-up">{t.dashboard.nextUp}</h3><Link className="small" to="/app/today">{t.dashboard.seeAll}</Link></div>
            {todayList.length ? <TaskList tasks={todayList} /> : <p className="card-pad muted" style={{ paddingTop: 0 }}>{t.dashboard.nothingToday}</p>}
          </section>

          {tomorrowList.length > 0 && (
            <section className="card" aria-labelledby="tomorrow">
              <div className="card-head"><h3 id="tomorrow">{t.dashboard.prepareTomorrow}</h3><Link className="small" to="/app/week">{t.dashboard.seeAll}</Link></div>
              <TaskList tasks={tomorrowList} />
            </section>
          )}

          {fam.tasks.length === 0 && (
            <Empty icon="📝" action={<div className="row-wrap" style={{ justifyContent: 'center' }}>
              <Link className="btn" to="/app/add?tab=paste">{t.dashboard.pasteFromIdukay}</Link>
              <Link className="btn secondary" to="/app/add">{t.dashboard.addTasks}</Link>
            </div>}>{t.dashboard.noTasks}</Empty>
          )}
          <p className="small faint">{t.common.sourceNote}</p>
        </>
      )}
    </div>
  );
}
