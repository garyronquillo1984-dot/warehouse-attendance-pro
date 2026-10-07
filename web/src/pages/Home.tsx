import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useOrg, canManage } from '../lib/org';
import { useWorkspace } from '../lib/workspace';
import { formatTime, formatDate, todayIn, workDateFor, isoWeekday, addDays } from '../lib/time';
import type { AttendanceStatus } from '../lib/types';
import { Loading, Notice } from '../components/ui';

type Tally = Record<AttendanceStatus | 'none', number>;

export default function Home() {
  const { current } = useOrg();
  const ws = useWorkspace(current?.organization_id);
  const [emps, setEmps] = useState<{ id: string; shift_id: string | null; warehouse_id: string }[] | null>(null);
  const [recs, setRecs] = useState<{ employee_id: string; work_date: string; status: AttendanceStatus }[]>([]);
  const today = todayIn(ws.timezone);

  useEffect(() => {
    if (!current || ws.loading) return;
    (async () => {
      const [e, r] = await Promise.all([
        supabase.from('employees').select('id, shift_id, warehouse_id').eq('organization_id', current.organization_id)
          .eq('status', 'active').limit(10000),
        supabase.from('attendance_records').select('employee_id, work_date, status')
          .eq('organization_id', current.organization_id).in('work_date', [today, addDays(today, -1)]).limit(20000),
      ]);
      setEmps(e.data ?? []);
      setRecs((r.data ?? []) as typeof recs);
    })();
  }, [current, ws.loading, today]);

  if (!current || ws.loading || !emps) return <Loading />;

  const manage = canManage(current);
  const byDate = new Map<string, Map<string, AttendanceStatus>>();
  recs.forEach(r => { if (!byDate.has(r.work_date)) byDate.set(r.work_date, new Map()); byDate.get(r.work_date)!.set(r.employee_id, r.status); });

  return (
    <div className="stack-lg">
      <div className="page-head">
        <h1>Today</h1>
        <p className="muted">{formatDate(today)} · {current.name}</p>
      </div>

      {!ws.warehouses.length && (
        <Notice kind="info">Your admin hasn’t given you access to a warehouse yet. Ask them to assign one to you.</Notice>
      )}

      {ws.warehouses.map(w => {
        const whEmps = emps.filter(e => e.warehouse_id === w.id);
        const shifts = w.shifts.filter(s => s.is_active && s.days.includes(isoWeekday(workDateFor(s, ws.timezone))));
        return (
          <section key={w.id} className="panel" aria-labelledby={`wh-${w.id}`}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <h2 id={`wh-${w.id}`}>{w.name}</h2>
              <span className="muted small">{whEmps.length} active employees</span>
            </div>
            {!whEmps.length && manage && (
              <Notice kind="info">No employees yet. <Link to={`/employees/import?wh=${w.id}`}>Import your roster</Link> to start taking attendance.</Notice>
            )}
            {shifts.length ? (
              <ul className="shift-cards">
                {shifts.map(s => {
                  const date = workDateFor(s, ws.timezone);
                  const marks = byDate.get(date) ?? new Map();
                  const roster = whEmps.filter(e => e.shift_id === s.id);
                  const t: Tally = { present: 0, late: 0, absent: 0, excused: 0, none: 0 };
                  roster.forEach(e => { t[(marks.get(e.id) as AttendanceStatus | undefined) ?? 'none']++; });
                  const done = roster.length > 0 && t.none === 0;
                  return (
                    <li key={s.id} className="shift-card">
                      <div>
                        <strong>{s.name}</strong>
                        <span className="muted small"> {formatTime(s.start_time)} – {formatTime(s.end_time)}{date !== today ? ' · started yesterday' : ''}</span>
                      </div>
                      {roster.length ? (
                        <p className="tally-line small">
                          <span className="t-present">{t.present} present</span> · <span className="t-late">{t.late} late</span> ·{' '}
                          <span className="t-absent">{t.absent} absent</span> · {t.excused} excused ·{' '}
                          <span className={t.none ? 't-none' : undefined}>{t.none} no record</span>
                        </p>
                      ) : <p className="small muted">No employees assigned to this shift.</p>}
                      <Link className={`btn ${done ? 'btn-ghost' : 'btn-primary'}`} to={`/attendance?wh=${w.id}&shift=${s.id}&date=${date}`}>
                        {done ? 'Review attendance' : t.present + t.late + t.absent + t.excused ? 'Continue attendance' : 'Take attendance'}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : <p className="muted">No shifts scheduled today.</p>}
          </section>
        );
      })}
    </div>
  );
}
