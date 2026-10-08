import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useViewer } from '../../lib/viewer';
import { useMarks } from '../../lib/marks';
import { useT } from '../../lib/i18n';
import { addDays, fmtDate, fmtLong, mondayOf, parseIso } from '../../lib/dates';
import { HISTORY_DAYS } from '../../lib/config';
import { activeOn, parentStatus, stableOrder } from '../../lib/status';
import { HomeworkCard, LastUpdated } from '../../components/Homework';
import { Empty, useSticky } from '../../components/ui';

// This week (Monday–Friday) and the previous 14 days. Pick a day to see its homework.
export function TwoWeeksPage() {
  const v = useViewer();
  const { t } = useT();
  const today = v.today;
  const [params, setParams] = useSearchParams();
  const min = addDays(today, -HISTORY_DAYS);
  const monday = mondayOf(today);
  const asked = params.get('dia');
  const day = asked && asked >= min && asked <= addDays(monday, 4) ? asked : today;
  const { markedOn, toggle } = useMarks(v.student!.id);
  const onToggle = useCallback((id: string) => toggle(id, today), [toggle, today]);

  const sorted = useMemo(() => [...v.homework].sort(stableOrder), [v.homework]);
  const list = useSticky(sorted, h => activeOn(h, day), `${v.student!.id}|${day}`);
  const count = (d: string) => v.homework.filter(h => activeOn(h, d)).length;
  const week = [0, 1, 2, 3, 4].map(i => addDays(monday, i));
  const earlier = Array.from({ length: HISTORY_DAYS + 1 }, (_, i) => addDays(today, -i)).filter(d => d < monday);
  const pick = (d: string) => setParams({ dia: d }, { replace: true });

  const dayBtn = (d: string, compact = false) => (
    <button type="button" key={d} data-day={d} aria-pressed={d === day} onClick={() => pick(d)}
      className={`day-btn${d === today ? ' today' : ''}${d === day ? ' selected' : ''}${compact ? ' compact' : ''}${[0, 6].includes(parseIso(d).getDay()) ? ' weekend' : ''}`}>
      <span className="dow">{fmtDate(d, t.locale, { weekday: 'short' }).replace('.', '')}</span>
      <span className="dn">{parseIso(d).getDate()}</span>
      <span className="cnt">{count(d)}</span>
    </button>
  );

  return (
    <div className="stack">
      <div className="page-head"><h1>{t.weeks.title}</h1><p className="muted">{t.weeks.subtitle}</p></div>
      <section className="stack-sm">
        <h3>{t.weeks.thisWeek}</h3>
        <div className="week-strip" data-testid="week-strip">{week.map(d => dayBtn(d))}</div>
      </section>
      {earlier.length > 0 && (
        <section className="stack-sm">
          <h3>{t.weeks.earlier}</h3>
          <div className="day-scroll" data-testid="earlier-days">{earlier.map(d => dayBtn(d, true))}</div>
        </section>
      )}
      <h2>{fmtLong(day, t.locale)}{day === today ? ` · ${t.weeks.today}` : ''} <span className="muted small">({t.weeks.tasks(list.length)})</span></h2>
      {list.length === 0 ? <Empty icon="📭">{t.weeks.empty}</Empty> : (
        <div className="stack-sm">{list.map(h => <HomeworkCard key={h.id} hw={h} status={parentStatus(h, today, markedOn(h.id))} today={today} onToggle={onToggle} />)}</div>
      )}
      <LastUpdated at={v.student!.last_updated_at} />
    </div>
  );
}
