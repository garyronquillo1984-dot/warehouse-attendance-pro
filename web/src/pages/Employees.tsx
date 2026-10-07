import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useOrg, canManage } from '../lib/org';
import { useWorkspace, pickWarehouse, lastWarehouse, fullName, isNewEmployee } from '../lib/workspace';
import { todayIn, formatDate } from '../lib/time';
import { friendlyError } from '../lib/errors';
import { EMPLOYEE_COLUMNS, type Employee } from '../lib/types';
import { Loading, Notice } from '../components/ui';

export default function Employees() {
  const { current } = useOrg();
  const ws = useWorkspace(current?.organization_id);
  const [params, setParams] = useSearchParams();
  const nav = useNavigate();
  const [employees, setEmployees] = useState<Employee[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const wh = pickWarehouse(ws.warehouses, params.get('wh'));
  const q = params.get('q') ?? '';
  const shiftF = params.get('shift') ?? '';
  const deptF = params.get('dept') ?? '';
  const statusF = params.get('status') ?? 'active';
  const manage = canManage(current);

  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v); else next.delete(k);
    setParams(next, { replace: true });
  };

  useEffect(() => {
    if (!wh) return;
    lastWarehouse.set(wh.id);
    setEmployees(null);
    supabase.from('employees').select(EMPLOYEE_COLUMNS).eq('warehouse_id', wh.id)
      .order('last_name').order('first_name').limit(5000)
      .then(({ data, error: err }) => {
        if (err) setError(friendlyError(err));
        setEmployees((data ?? []) as Employee[]);
      });
  }, [wh?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const today = todayIn(ws.timezone);
  const shiftName = useMemo(() => Object.fromEntries((wh?.shifts ?? []).map(s => [s.id, s.name])), [wh]);
  const deptName = useMemo(() => Object.fromEntries((wh?.departments ?? []).map(d => [d.id, d.name])), [wh]);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (employees ?? []).filter(e =>
      (statusF === 'all' || e.status === statusF)
      && (!shiftF || (shiftF === 'none' ? !e.shift_id : e.shift_id === shiftF))
      && (!deptF || e.department_id === deptF)
      && (!needle || e.employee_code.toLowerCase().includes(needle)
          || `${e.first_name} ${e.last_name}`.toLowerCase().includes(needle)
          || `${e.last_name}, ${e.first_name}`.toLowerCase().includes(needle)));
  }, [employees, q, shiftF, deptF, statusF]);

  if (ws.loading) return <Loading />;
  if (!wh) return <Notice kind="info">You don’t have access to a warehouse yet. Ask your admin to assign one to you.</Notice>;

  const activeCount = (employees ?? []).filter(e => e.status === 'active').length;
  const newCount = (employees ?? []).filter(e => isNewEmployee(e, today)).length;

  return (
    <div className="stack-lg">
      <div className="page-head row" style={{ justifyContent: 'space-between', alignItems: 'end' }}>
        <div className="stack" style={{ gap: 6 }}>
          <h1>Employees</h1>
          <p className="muted">
            {employees ? `${activeCount} active${newCount ? ` · ${newCount} new this week or not started yet` : ''}` : 'Loading…'}
          </p>
        </div>
        {manage && (
          <div className="row">
            <Link className="btn btn-ghost" to={`/employees/import?wh=${wh.id}`}>Import from Excel or CSV</Link>
            <Link className="btn btn-primary" to={`/employees/new?wh=${wh.id}`}>Add employee</Link>
          </div>
        )}
      </div>

      {error && <Notice kind="error">{error}</Notice>}

      <div className="filters">
        {ws.warehouses.length > 1 && (
          <div className="field">
            <label htmlFor="f-wh">Warehouse</label>
            <select id="f-wh" value={wh.id} onChange={e => set('wh', e.target.value)}>
              {ws.warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
        )}
        <div className="field grow">
          <label htmlFor="f-q">Search</label>
          <input id="f-q" type="search" placeholder="Name or badge ID" value={q} onChange={e => set('q', e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="f-shift">Shift</label>
          <select id="f-shift" value={shiftF} onChange={e => set('shift', e.target.value)}>
            <option value="">All shifts</option>
            {wh.shifts.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            <option value="none">No shift</option>
          </select>
        </div>
        {wh.departments.length > 0 && (
          <div className="field">
            <label htmlFor="f-dept">Department</label>
            <select id="f-dept" value={deptF} onChange={e => set('dept', e.target.value)}>
              <option value="">All departments</option>
              {wh.departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
        )}
        <div className="field">
          <label htmlFor="f-status">Status</label>
          <select id="f-status" value={statusF} onChange={e => set('status', e.target.value === 'active' ? '' : e.target.value)}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="all">All</option>
          </select>
        </div>
      </div>

      {!employees ? <Loading /> : !employees.length ? (
        <section className="panel empty">
          <h2>No employees in {wh.name} yet</h2>
          <p className="muted">{manage
            ? 'Import your roster from Excel or CSV, or add people one at a time. Badge ID is how everyone is matched.'
            : 'Your admin hasn’t added employees to this warehouse yet.'}</p>
          {manage && (
            <div className="row">
              <Link className="btn btn-primary" to={`/employees/import?wh=${wh.id}`}>Import from Excel or CSV</Link>
              <Link className="btn btn-ghost" to={`/employees/new?wh=${wh.id}`}>Add one employee</Link>
            </div>
          )}
        </section>
      ) : (
        <section className="panel flush">
          <p className="list-count small muted">{list.length === employees.length ? `${list.length} employees` : `${list.length} of ${employees.length} employees`}</p>
          {!list.length ? <p className="muted pad">No one matches these filters.</p> : (
            <table className="emp-table">
              <thead>
                <tr><th>Name</th><th>Badge ID</th><th>Shift</th><th>Department</th><th>First day</th></tr>
              </thead>
              <tbody>
                {list.map(e => (
                  <tr key={e.id} className={manage ? 'clickable' : undefined} data-inactive={e.status !== 'active' || undefined}
                      onClick={manage ? () => nav(`/employees/${e.id}`) : undefined}>
                    <td data-label="Name">
                      {manage ? <Link to={`/employees/${e.id}`} onClick={ev => ev.stopPropagation()}>{fullName(e)}</Link> : fullName(e)}
                      {isNewEmployee(e, today) && <span className="tag tag-new">New</span>}
                      {e.status !== 'active' && <span className="tag">Inactive</span>}
                    </td>
                    <td data-label="Badge ID" className="mono">{e.employee_code}</td>
                    <td data-label="Shift">{e.shift_id ? shiftName[e.shift_id] : <span className="muted">—</span>}</td>
                    <td data-label="Department">{e.department_id ? deptName[e.department_id] : <span className="muted">—</span>}</td>
                    <td data-label="First day">{e.first_attendance_date
                      ? formatDate(e.first_attendance_date, { month: 'short', day: 'numeric', year: 'numeric' })
                      : <span className="muted">Not yet</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}
    </div>
  );
}
