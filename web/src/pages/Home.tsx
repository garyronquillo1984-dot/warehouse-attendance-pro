import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useOrg, canManage } from '../lib/org';
import { formatTime, WEEKDAYS } from '../lib/time';
import type { Shift, Warehouse } from '../lib/types';
import { Loading, Notice } from '../components/ui';

interface WarehouseWithShifts extends Warehouse { shifts: Shift[] }

function todayIso(tz: string) {
  // ISO weekday (1 = Monday) in the company's time zone
  const wd = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: tz }).format(new Date());
  return WEEKDAYS.find(d => d.short === wd)?.n ?? 1;
}

export default function Home() {
  const { current } = useOrg();
  const [data, setData] = useState<WarehouseWithShifts[] | null>(null);
  const [tz, setTz] = useState('America/New_York');

  useEffect(() => {
    if (!current) return;
    (async () => {
      const { data: org } = await supabase.from('organizations').select('timezone').eq('id', current.organization_id).single();
      if (org?.timezone) setTz(org.timezone);
      const { data: wh } = await supabase.from('warehouses')
        .select('id, organization_id, name, is_active, shifts(id, name, start_time, end_time, days, late_grace_minutes, is_active, sort_order)')
        .eq('organization_id', current.organization_id).order('created_at');
      setData((wh ?? []) as unknown as WarehouseWithShifts[]);
    })();
  }, [current]);

  if (!current || !data) return <Loading />;

  const weekday = todayIso(tz);
  const dateLabel = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: tz }).format(new Date());

  return (
    <div className="stack-lg">
      <div className="page-head">
        <h1>Today</h1>
        <p className="muted">{dateLabel} · {current.name}</p>
      </div>

      {!data.length && (
        <Notice kind="info">Your admin hasn’t given you access to a warehouse yet. Ask them to assign one to you.</Notice>
      )}

      {data.map(w => {
        const running = (w.shifts ?? []).filter(s => s.is_active && s.days.includes(weekday))
          .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
        return (
          <section key={w.id} className="panel" aria-labelledby={`wh-${w.id}`}>
            <h2 id={`wh-${w.id}`}>{w.name}</h2>
            {running.length ? (
              <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {running.map(s => (
                  <li key={s.id} className="row" style={{ justifyContent: 'space-between', borderTop: '1px solid var(--line)', paddingTop: 12 }}>
                    <strong>{s.name}</strong>
                    <span className="muted">{formatTime(s.start_time)} – {formatTime(s.end_time)}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="muted">No shifts scheduled today.</p>}
          </section>
        );
      })}

      <section className="panel">
        <h2>Coming next</h2>
        <p>Attendance capture, employee lists and reports arrive in the next updates. Your company, warehouse and
           shifts are already saved, so you’ll pick up right where you left off.</p>
        {canManage(current) && <Link to="/settings" className="btn btn-ghost" style={{ justifySelf: 'start' }}>Edit shifts</Link>}
      </section>
    </div>
  );
}
