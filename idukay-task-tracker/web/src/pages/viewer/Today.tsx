import { useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useViewer } from '../../lib/viewer';
import { useMarks } from '../../lib/marks';
import { useT } from '../../lib/i18n';
import { addDays, fmtDate, fmtLong, mondayOf, parseIso } from '../../lib/dates';
import { activeOn, inToday, parentStatus, stableOrder } from '../../lib/status';
import { HomeworkCard, LastUpdated } from '../../components/Homework';
import { useSticky } from '../../components/ui';

// The main screen: how many assignments today, how many done / pending / overdue, then the list.
export function TodayPage() {
  const v = useViewer();
  const { t } = useT();
  const s = v.student!;
  const today = v.today;
  const { markedOn, toggle } = useMarks(s.id);
  const onToggle = useCallback((id: string) => toggle(id, today), [toggle, today]);

  const sorted = useMemo(() => [...v.homework].sort(stableOrder), [v.homework]);
  // Rows stay where they are while the page is open, even when a mark changes their group.
  const list = useSticky(sorted, h => inToday(h, today, markedOn(h.id)), `${s.id}|${today}`);
  const statuses = list.map(h => parentStatus(h, today, markedOn(h.id)));
  const done = statuses.filter(x => x === 'completed').length;
  const overdue = statuses.filter(x => x === 'overdue').length;
  const pending = list.length - done - overdue;

  const newToday = [...new Set(v.homework.filter(h => h.is_new && h.created_at.slice(0, 10) >= addDays(today, -1) && h.status !== 'archived').map(h => h.subject))];
  const upcoming = sorted.filter(h => h.start_date > today && h.start_date <= addDays(today, 7));
  const monday = mondayOf(today);
  const week = [0, 1, 2, 3, 4].map(i => addDays(monday, i));
  const hour = new Date().getHours();

  return (
    <div className="stack">
      <div className="page-head">
        <p className="muted">{hour < 12 ? t.today.greeting.morning : hour < 19 ? t.today.greeting.afternoon : t.today.greeting.evening}</p>
        <h1>{t.today.title}</h1>
        <p className="muted">{fmtLong(today, t.locale)}</p>
      </div>

      <section className="counter card" aria-live="polite" data-testid="today-counter">
        <div className="counter-who">{s.first_name} — {s.grade_short} — {t.locale.startsWith('es') ? 'Paralelo' : 'Parallel'} {s.parallel}</div>
        <div className="counter-n">{t.today.count(list.length)}</div>
        <div className="counter-parts">
          <span className="part green">🟢 {t.today.completed(done)}</span>
          <span className="part yellow">🟡 {t.today.pending(pending)}</span>
          <span className="part red">🔴 {t.today.overdue(overdue)}</span>
        </div>
        <p className="counter-sentence" data-testid="today-summary">
          {t.today.summary(s.first_name, list.length)}{' '}
          {list.length > 0 && (done === list.length ? t.today.allDone : t.today.stillPending(list.length - done))}
        </p>
      </section>

      {newToday.length > 0 && <div className="new-banner" data-testid="new-banner">{t.today.newToday(newToday.join(', '))}</div>}

      <div className="stack-sm">
        {list.map((h, i) => <HomeworkCard key={h.id} hw={h} status={statuses[i]} today={today} onToggle={onToggle} />)}
      </div>
      {list.length > 0 && <p className="small faint">✔︎ {t.today.marksNote}</p>}

      <section className="card card-pad stack-sm">
        <h3>{t.today.thisWeek}</h3>
        <div className="week-strip">
          {week.map(d => {
            const n = v.homework.filter(h => activeOn(h, d)).length;
            return (
              <Link key={d} to={`/semanas?dia=${d}`} className={`day-btn${d === today ? ' today' : ''}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                <span className="dow">{fmtDate(d, t.locale, { weekday: 'short' }).replace('.', '')}</span>
                <span className="dn">{parseIso(d).getDate()}</span>
                <span className="cnt">{n}</span>
              </Link>
            );
          })}
        </div>
      </section>

      <details className="card card-pad upcoming">
        <summary><strong>🔵 {t.today.upcoming}</strong> <span className="muted small">({upcoming.length})</span></summary>
        <p className="small muted" style={{ margin: '6px 0 10px' }}>{t.today.upcomingHint}</p>
        {upcoming.length ? <div className="stack-sm">{upcoming.map(h => <HomeworkCard key={h.id} hw={h} status="upcoming" today={today} />)}</div>
          : <p className="small muted">{t.today.noUpcoming}</p>}
      </details>

      <LastUpdated at={s.last_updated_at} />
      <p className="small faint">{t.common.notOfficial}</p>
    </div>
  );
}
