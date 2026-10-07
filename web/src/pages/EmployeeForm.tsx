import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useOrg, canManage } from '../lib/org';
import { useWorkspace, pickWarehouse } from '../lib/workspace';
import { friendlyError } from '../lib/errors';
import { formatDate } from '../lib/time';
import { EMPLOYEE_COLUMNS, type Employee } from '../lib/types';
import { Field, Loading, Notice } from '../components/ui';

interface Form {
  employee_code: string; first_name: string; last_name: string;
  shift_id: string; department: string; hire_date: string; active: boolean;
}
const EMPTY: Form = { employee_code: '', first_name: '', last_name: '', shift_id: '', department: '', hire_date: '', active: true };

export default function EmployeeForm() {
  const { id } = useParams();
  const isNew = !id;
  const [params] = useSearchParams();
  const nav = useNavigate();
  const { current } = useOrg();
  const ws = useWorkspace(current?.organization_id);
  const [emp, setEmp] = useState<Employee | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [loaded, setLoaded] = useState(isNew);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (isNew) return;
    supabase.from('employees').select(EMPLOYEE_COLUMNS).eq('id', id!).maybeSingle().then(({ data }) => {
      setEmp(data as Employee | null);
      setLoaded(true);
    });
  }, [id, isNew]);

  const wh = isNew ? pickWarehouse(ws.warehouses, params.get('wh')) : ws.warehouses.find(w => w.id === emp?.warehouse_id);

  useEffect(() => {
    if (!emp || !wh) return;
    setForm({
      employee_code: emp.employee_code, first_name: emp.first_name, last_name: emp.last_name,
      shift_id: emp.shift_id ?? '', department: wh.departments.find(d => d.id === emp.department_id)?.name ?? '',
      hire_date: emp.hire_date ?? '', active: emp.status === 'active',
    });
  }, [emp, wh]);

  if (!canManage(current)) return <Navigate to="/employees" replace />;
  if (ws.loading || !loaded) return <Loading />;
  if (!isNew && !emp) return <Notice kind="error">This employee doesn’t exist or you can’t see them.</Notice>;
  if (!wh) return <Notice kind="info">Add a warehouse in Settings first.</Notice>;

  const up = (patch: Partial<Form>) => setForm(f => ({ ...f, ...patch }));

  async function departmentId(name: string): Promise<string | null> {
    const n = name.trim();
    if (!n) return null;
    const found = wh!.departments.find(d => d.name.toLowerCase() === n.toLowerCase());
    if (found) return found.id;
    const { data, error } = await supabase.from('departments')
      .insert({ organization_id: wh!.organization_id, warehouse_id: wh!.id, name: n }).select('id').single();
    if (error) throw error;
    return data.id;
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      const fields = {
        employee_code: form.employee_code.trim(),
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        shift_id: form.shift_id || null,
        department_id: await departmentId(form.department),
        hire_date: form.hire_date || null,
        status: form.active ? 'active' : 'inactive',
      };
      if (isNew) {
        const { error } = await supabase.from('employees')
          .insert({ ...fields, organization_id: wh!.organization_id, warehouse_id: wh!.id });
        if (error) throw error;
        nav(`/employees?wh=${wh!.id}`, { replace: true });
        return;
      }
      const { error } = await supabase.from('employees').update(fields).eq('id', emp!.id);
      if (error) throw error;
      await ws.reload();
      setMsg({ kind: 'ok', text: 'Employee saved.' });
    } catch (err) {
      setMsg({ kind: 'error', text: friendlyError(err) });
    } finally {
      setBusy(false);
    }
  }

  const valid = form.employee_code.trim() && form.first_name.trim() && form.last_name.trim();

  return (
    <div className="stack-lg narrow">
      <div className="page-head">
        <Link to={`/employees?wh=${wh.id}`} className="small back">‹ Employees</Link>
        <h1>{isNew ? 'Add employee' : `${emp!.first_name} ${emp!.last_name}`}</h1>
        <p className="muted">{wh.name}{emp?.first_attendance_date
          ? ` · First day ${formatDate(emp.first_attendance_date, { month: 'short', day: 'numeric', year: 'numeric' })}`
          : !isNew ? ' · Hasn’t worked a first day yet' : ''}</p>
      </div>

      <form className="panel" onSubmit={save}>
        {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
        <Field label="Badge ID" name="employee_code" required maxLength={40} autoFocus={isNew}
               hint="Unique in your company. Attendance and imports match people by this number, never by name."
               value={form.employee_code} onChange={e => up({ employee_code: e.target.value })} />
        <div className="two">
          <Field label="First name" name="first_name" required maxLength={80}
                 value={form.first_name} onChange={e => up({ first_name: e.target.value })} />
          <Field label="Last name" name="last_name" required maxLength={80}
                 value={form.last_name} onChange={e => up({ last_name: e.target.value })} />
        </div>
        <div className="two">
          <div className="field">
            <label htmlFor="shift">Shift</label>
            <select id="shift" value={form.shift_id} onChange={e => up({ shift_id: e.target.value })}>
              <option value="">No shift</option>
              {wh.shifts.map(s => <option key={s.id} value={s.id}>{s.name}{s.is_active ? '' : ' (off)'}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="department">Department</label>
            <input id="department" list="departments" maxLength={80} value={form.department}
                   onChange={e => up({ department: e.target.value })} placeholder="Optional" />
            <datalist id="departments">{wh.departments.map(d => <option key={d.id} value={d.name} />)}</datalist>
            <span className="hint">Pick one or type a new name.</span>
          </div>
        </div>
        <div className="field" style={{ maxWidth: 260 }}>
          <label htmlFor="hire_date">Hire date</label>
          <input id="hire_date" type="date" value={form.hire_date} onChange={e => up({ hire_date: e.target.value })} />
        </div>
        <label className="check">
          <input type="checkbox" checked={form.active} onChange={e => up({ active: e.target.checked })} />
          <span><strong>Active</strong><br /><span className="muted small">Turn off when someone leaves. Their attendance history stays.</span></span>
        </label>
        <div className="row">
          <button className="btn btn-primary" disabled={busy || !valid}>{busy ? 'Saving…' : isNew ? 'Add employee' : 'Save employee'}</button>
          <Link className="btn btn-ghost" to={`/employees?wh=${wh.id}`}>Cancel</Link>
        </div>
      </form>
    </div>
  );
}
