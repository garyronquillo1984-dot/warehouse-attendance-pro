import { useEffect, useMemo, useState } from 'react';
import { useViewer } from '../../lib/viewer';
import { useMarks } from '../../lib/marks';
import { useT } from '../../lib/i18n';
import { addDays, capFirst, fmtDate, mondayOf, parseIso } from '../../lib/dates';
import type { Homework } from '../../lib/types';
import { HomeworkCard } from '../../components/Homework';
import { Empty, Spinner } from '../../components/ui';

// Every homework whose due date has passed, by year → month → week. Read-only, never deleted.
export function ArchivePage() {
  const v = useViewer();
  const { t } = useT();
  const { markedOn } = useMarks(v.student!.id);
  const [months, setMonths] = useState<Array<{ month: string; count: number }> | null>(null);
  const [month, setMonth] = useState<string | null>(null);
  const [subject, setSubject] = useState('');
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [date, setDate] = useState('');
  const [rows, setRows] = useState<Homework[] | null>(null);

  useEffect(() => {
    v.fetchArchiveMonths().then(m => { setMonths(m); setMonth(cur => cur ?? m[0]?.month ?? null); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v.student?.id]);
  useEffect(() => { const id = setTimeout(() => setQuery(q), 300); return () => clearTimeout(id); }, [q]);
  useEffect(() => {
    if (!month) { setRows([]); return; }
    setRows(null);
    v.fetchArchive(month, subject || null, query || null).then(setRows);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, subject, query, v.student?.id]);

  const subjects = useMemo(() => [...new Set(v.homework.map(h => h.subject).concat((rows ?? []).map(h => h.subject)))].sort(), [v.homework, rows]);
  const shown = (rows ?? []).filter(h => !date || (h.start_date <= date && h.due_date >= date));
  const weeks = new Map<string, Homework[]>();
  for (const h of shown) { const w = mondayOf(h.due_date); weeks.set(w, [...(weeks.get(w) ?? []), h]); }
  const byYear = new Map<string, Array<{ month: string; count: number }>>();
  for (const m of months ?? []) byYear.set(m.month.slice(0, 4), [...(byYear.get(m.month.slice(0, 4)) ?? []), m]);
  const monthName = (m: string) => capFirst(new Intl.DateTimeFormat(t.locale, { month: 'long', year: 'numeric' }).format(parseIso(m)));

  if (months === null) return <Spinner />;
  return (
    <div className="stack">
      <div className="page-head"><h1>{t.archive.title}</h1><p className="muted">{t.archive.subtitle}</p></div>
      {months.length === 0 ? <Empty icon="📁">{t.archive.noArchive}</Empty> : <>
        <div className="card card-pad stack-sm">
          <div className="grid-2">
            <label className="field"><span>{t.archive.month}</span>
              <select value={month ?? ''} onChange={e => { setMonth(e.target.value); setDate(''); }} data-testid="archive-month">
                {[...byYear].map(([y, ms]) => <optgroup key={y} label={y}>{ms.map(m => <option key={m.month} value={m.month}>{monthName(m.month)} ({m.count})</option>)}</optgroup>)}
              </select></label>
            <label className="field"><span>{t.archive.subject}</span>
              <select value={subject} onChange={e => setSubject(e.target.value)} data-testid="archive-subject">
                <option value="">{t.common.all}</option>{subjects.map(x => <option key={x} value={x}>{x}</option>)}
              </select></label>
            <label className="field"><span>{t.archive.date}</span>
              <input type="date" value={date} max={addDays(v.today, -1)} onChange={e => { setDate(e.target.value); if (e.target.value) setMonth(`${e.target.value.slice(0, 7)}-01`); }} /></label>
            <label className="field"><span>{t.common.search}</span>
              <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder={t.archive.search} data-testid="archive-search" /></label>
          </div>
        </div>
        {rows === null ? <Spinner /> : shown.length === 0 ? <Empty icon="🔎">{t.archive.empty}</Empty> : (
          <>
            <p className="small muted">{month && monthName(month)} · {t.archive.results(shown.length)}</p>
            {[...weeks].map(([w, hs]) => (
              <section key={w} className="stack-sm" data-testid="archive-week">
                <h3>{t.archive.week(fmtDate(w, t.locale, { day: 'numeric', month: 'long' }), fmtDate(addDays(w, 4), t.locale, { day: 'numeric', month: 'long' }))}</h3>
                {hs.map(h => <HomeworkCard key={h.id} hw={h} status={markedOn(h.id) ? 'completed' : 'archived'} today={v.today} />)}
              </section>
            ))}
          </>
        )}
      </>}
    </div>
  );
}
