import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useOrg, canManage } from '../lib/org';
import { useWorkspace, pickWarehouse, lastWarehouse, fullName, isNewEmployee } from '../lib/workspace';
import { currentShiftId, workDateFor, isLateNow, todayIn, formatDate, formatTime, isoWeekday, addDays, WEEKDAYS } from '../lib/time';
import { friendlyError } from '../lib/errors';
import { EMPLOYEE_COLUMNS, type AttendanceRecord, type AttendanceStatus, type Employee } from '../lib/types';
import { Loading, Notice } from '../components/ui';

const STATUSES: { value: AttendanceStatus; label: string; key: string }[] = [
  { value: 'present', label: 'Present', key: 'P' },
  { value: 'late', label: 'Late', key: 'L' },
  { value: 'absent', label: 'Absent', key: 'A' },
  { value: 'excused', label: 'Excused', key: 'E' },
];
type Filter = 'all' | AttendanceStatus | 'none';

export default function Attendance() {
  const { current } = useOrg();
  const ws = useWorkspace(current?.organization_id);
  const [params, setParams] = useSearchParams();
  const wh = pickWarehouse(ws.warehouses, params.get('wh'));
  const tz = ws.timezone;

  const shifts = useMemo(() => (wh?.shifts ?? []).filter(s => s.is_active), [wh]);
  const shiftId = params.get('shift') && (params.get('shift') === 'all' || shifts.some(s => s.id === params.get('shift')))
    ? params.get('shift')! : currentShiftId(shifts, tz) ?? 'all';
  const shift = shifts.find(s => s.id === shiftId);
  const today = todayIn(tz);
  const date = params.get('date') && params.get('date')! <= today ? params.get('date')! : workDateFor(shift, tz);

  const [employees, setEmployees] = useState<Employee[] | null>(null);
  const [records, setRecords] = useState<Map<string, AttendanceRecord>>(new Map());
  const [loadedKey, setLoadedKey] = useState('');
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const [scanMsg, setScanMsg] = useState<{ kind: 'ok' | 'error' | 'info'; text: string } | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const scanRef = useRef<HTMLInputElement>(null);

  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) { if (v) next.set(k, v); else next.delete(k); }
    setParams(next, { replace: true });
  };

  // Employees of the warehouse (all shifts, so a scanned badge from another shift is still found).
  useEffect(() => {
    if (!wh) return;
    lastWarehouse.set(wh.id);
    setEmployees(null);
    supabase.from('employees').select(EMPLOYEE_COLUMNS).eq('warehouse_id', wh.id).eq('status', 'active')
      .order('last_name').order('first_name').limit(5000)
      .then(({ data, error: err }) => {
        if (err) setError(friendlyError(err));
        setEmployees((data ?? []) as Employee[]);
      });
  }, [wh?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadRecords = useCallback(async () => {
    if (!wh) return;
    const key = `${wh.id}|${date}`;
    const { data, error: err } = await supabase.from('attendance_records')
      .select('id, employee_id, work_date, shift_id, status, reason_code, note')
      .eq('warehouse_id', wh.id).eq('work_date', date).limit(5000);
    if (err) setError(friendlyError(err));
    setRecords(new Map(((data ?? []) as AttendanceRecord[]).map(r => [r.employee_id, r])));
    setLoadedKey(key);
  }, [wh, date]);

  useEffect(() => { loadRecords(); }, [loadRecords]);

  const shiftName = useMemo(() => Object.fromEntries((wh?.shifts ?? []).map(s => [s.id, s.name])), [wh]);
  const deptName = useMemo(() => Object.fromEntries((wh?.departments ?? []).map(d => [d.id, d.name])), [wh]);

  // The roster for this shift. Order is fixed by name and never changes when statuses do,
  // so the list doesn't jump under a supervisor's thumb.
  const roster = useMemo(() => (employees ?? []).filter(e =>
    shiftId === 'all' || e.shift_id === shiftId || records.get(e.id)?.shift_id === shiftId), [employees, shiftId, records]);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: roster.length, present: 0, late: 0, absent: 0, excused: 0, none: 0 };
    roster.forEach(e => { const r = records.get(e.id); c[r ? r.status : 'none']++; });
    return c;
  }, [roster, records]);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return roster.filter(e => {
      const st: Filter = records.get(e.id)?.status ?? 'none';
      if (filter !== 'all' && st !== filter) return false;
      if (!needle) return true;
      return e.employee_code.toLowerCase().includes(needle)
        || `${e.first_name} ${e.last_name}`.toLowerCase().includes(needle)
        || `${e.last_name}, ${e.first_name}`.toLowerCase().includes(needle);
    });
  }, [roster, records, filter, q]);

  const busy = (id: string, on: boolean) => setSaving(prev => { const n = new Set(prev); if (on) n.add(id); else n.delete(id); return n; });

  async function save(emp: Employee, status: AttendanceStatus | null, reason: string | null = null) {
    const before = records.get(emp.id);
    setError(null);
    // Optimistic: the button lights up immediately; it rolls back if the server says no.
    setRecords(prev => {
      const n = new Map(prev);
      if (status) n.set(emp.id, { id: before?.id ?? 'pending', employee_id: emp.id, work_date: date,
        shift_id: before?.shift_id ?? emp.shift_id, status, reason_code: status === 'absent' || status === 'excused' ? reason : null, note: before?.note ?? null });
      else n.delete(emp.id);
      return n;
    });
    busy(emp.id, true);
    const { error: err } = status
      ? await supabase.rpc('record_attendance', { for_date: date, entries: [{ employee_id: emp.id, status, reason_code: reason }] })
      : await supabase.from('attendance_records').delete().eq('employee_id', emp.id).eq('work_date', date);
    busy(emp.id, false);
    if (err) {
      setError(`${fullName(emp)}: ${friendlyError(err)}`);
      setRecords(prev => { const n = new Map(prev); if (before) n.set(emp.id, before); else n.delete(emp.id); return n; });
      return false;
    }
    return true;
  }

  function tap(emp: Employee, status: AttendanceStatus) {
    const cur = records.get(emp.id);
    if (cur?.status === status) return save(emp, null);           // tapping the lit button clears it ("No record")
    return save(emp, status, status === 'absent' || status === 'excused' ? cur?.reason_code ?? null : null);
  }

  async function scan(e: FormEvent) {
    e.preventDefault();
    const code = q.trim();
    if (!code) return;
    const emp = (employees ?? []).find(x => x.employee_code.toLowerCase() === code.toLowerCase());
    if (!emp) {
      // Typing a name is a search, not a scan: only complain when it looks like a badge.
      if (/\d/.test(code)) {
        setScanMsg({ kind: 'error', text: `No active employee with badge ${code} in ${wh!.name}.` });
        setQ('');                                   // ready for the next scan; the list isn't left filtered
      }
      return;
    }
    const cur = records.get(emp.id);
    setQ('');
    setFlash(emp.id);
    setTimeout(() => setFlash(f => (f === emp.id ? null : f)), 1600);
    if (cur && (cur.status === 'present' || cur.status === 'late')) {
      setScanMsg({ kind: 'info', text: `${fullName(emp)} is already marked ${cur.status}.` });
      return;
    }
    const empShift = (wh?.shifts ?? []).find(s => s.id === emp.shift_id) ?? shift;
    const status: AttendanceStatus = date === today && isLateNow(empShift, date, tz) ? 'late' : 'present';
    const ok = await save(emp, status);
    if (ok) {
      const other = emp.shift_id && shiftId !== 'all' && emp.shift_id !== shiftId ? ` (works ${shiftName[emp.shift_id]})` : '';
      setScanMsg({ kind: 'ok', text: `${fullName(emp)}: ${status === 'late' ? 'Late' : 'Present'}${other}` });
    }
    scanRef.current?.focus();
  }

  async function markRestPresent() {
    setConfirmAll(false);
    const rest = roster.filter(e => !records.get(e.id));
    if (!rest.length) return;
    setError(null);
    rest.forEach(e => busy(e.id, true));
    const { error: err } = await supabase.rpc('record_attendance', {
      for_date: date, entries: rest.map(e => ({ employee_id: e.id, status: 'present' })),
    });
    rest.forEach(e => busy(e.id, false));
    if (err) return setError(friendlyError(err));
    await loadRecords();
  }

  if (ws.loading) return <Loading />;
  if (!wh) return <Notice kind="info">You don’t have access to a warehouse yet. Ask your admin to assign one to you.</Notice>;

  const notScheduled = shift && !shift.days.includes(isoWeekday(date));
  const ready = employees && loadedKey === `${wh.id}|${date}`;
  const unmarked = roster.filter(e => !records.get(e.id)).length;

  return (
    <div className="stack-lg">
      <div className="page-head">
        <h1>Attendance</h1>
        <p className="muted">{formatDate(date)}{date === today ? ' · today' : ''} · {wh.name}</p>
      </div>

      <div className="filters">
        {ws.warehouses.length > 1 && (
          <div className="field">
            <label htmlFor="a-wh">Warehouse</label>
            <select id="a-wh" value={wh.id} onChange={e => set({ wh: e.target.value, shift: null })}>
              {ws.warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
        )}
        <div className="field">
          <label htmlFor="a-shift">Shift</label>
          <select id="a-shift" value={shiftId} onChange={e => set({ shift: e.target.value })}>
            {shifts.map(s => <option key={s.id} value={s.id}>{s.name} · {formatTime(s.start_time)}–{formatTime(s.end_time)}</option>)}
            <option value="all">All shifts</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="a-date">Date</label>
          <div className="date-row">
            <button type="button" className="btn btn-ghost icon" aria-label="Previous day" onClick={() => set({ date: addDays(date, -1) })}>‹</button>
            <input id="a-date" type="date" value={date} max={today} onChange={e => e.target.value && set({ date: e.target.value })} />
            <button type="button" className="btn btn-ghost icon" aria-label="Next day" disabled={date >= today} onClick={() => set({ date: addDays(date, 1) })}>›</button>
          </div>
        </div>
      </div>

      {notScheduled && (
        <Notice kind="info">{shift!.name} isn’t scheduled on {WEEKDAYS.find(d => d.n === isoWeekday(date))?.short}s.
          You can still take attendance if people came in.</Notice>
      )}
      {error && <Notice kind="error">{error}</Notice>}

      {!ready ? <Loading /> : !employees!.length ? (
        <section className="panel empty">
          <h2>No employees in {wh.name} yet</h2>
          <p className="muted">Attendance is taken from the employee list.</p>
          {canManage(current) && <Link className="btn btn-primary" style={{ justifySelf: 'start' }} to={`/employees/import?wh=${wh.id}`}>Import employees</Link>}
        </section>
      ) : (
        <>
          <div className="capture-bar">
            <form className="scan" onSubmit={scan} role="search">
              <label htmlFor="scan" className="sr-only">Scan a badge or search by name</label>
              <input id="scan" ref={scanRef} type="search" inputMode="search" autoComplete="off" enterKeyHint="go"
                     placeholder="Scan a badge or type a name" value={q}
                     onChange={e => { setQ(e.target.value); setScanMsg(null); }} />
              <button className="btn btn-primary">Mark</button>
            </form>
            <div className="scan-msg" aria-live="polite">
              {scanMsg && <span className={`scan-${scanMsg.kind}`}>{scanMsg.text}</span>}
            </div>
            <ul className="chips tally" aria-label="Show">
              {([['all', 'All'], ['none', 'No record'], ['present', 'Present'], ['late', 'Late'], ['absent', 'Absent'], ['excused', 'Excused']] as [Filter, string][]).map(([f, label]) => (
                <li key={f}>
                  <button type="button" className={`chip chip-${f}`} aria-pressed={filter === f} onClick={() => setFilter(f)}>
                    {label} <strong>{counts[f]}</strong>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {roster.length > 0 && unmarked > 0 && (
            <div className="row bulk">
              {!confirmAll ? (
                <button type="button" className="btn btn-ghost" onClick={() => setConfirmAll(true)}>
                  Mark the {unmarked} with no record as present
                </button>
              ) : (
                <>
                  <span>Mark {unmarked} {unmarked === 1 ? 'person' : 'people'} present?</span>
                  <button type="button" className="btn btn-go" onClick={markRestPresent}>Yes, mark present</button>
                  <button type="button" className="btn btn-ghost" onClick={() => setConfirmAll(false)}>Cancel</button>
                </>
              )}
            </div>
          )}

          <section className="panel flush">
            {!roster.length ? (
              <p className="muted pad">No active employees are assigned to {shift?.name ?? 'this shift'}. Assign shifts in Employees, or choose All shifts.</p>
            ) : !visible.length ? (
              <p className="muted pad">No one matches.</p>
            ) : (
              <ul className="roster">
                {visible.map(emp => {
                  const rec = records.get(emp.id);
                  const needsReason = rec && (rec.status === 'absent' || rec.status === 'excused');
                  return (
                    <li key={emp.id} className="roster-row" data-status={rec?.status ?? 'none'} data-flash={flash === emp.id || undefined}>
                      <div className="who">
                        <span className="name">{fullName(emp)}</span>
                        {isNewEmployee(emp, date) && <span className="tag tag-new">New</span>}
                        <span className="meta">
                          <span className="mono">{emp.employee_code}</span>
                          {emp.department_id && <> · {deptName[emp.department_id]}</>}
                          {shiftId === 'all' && emp.shift_id && <> · {shiftName[emp.shift_id]}</>}
                        </span>
                      </div>
                      <div className="marks" role="group" aria-label={`Attendance for ${fullName(emp)}`}>
                        {STATUSES.map(s => (
                          <button key={s.value} type="button" className={`mark mark-${s.value}`}
                                  aria-pressed={rec?.status === s.value} disabled={saving.has(emp.id)}
                                  aria-label={s.label} title={rec?.status === s.value ? `${s.label} — tap again to clear` : s.label}
                                  onClick={() => tap(emp, s.value)}>
                            <span className="long">{s.label}</span><span className="short" aria-hidden="true">{s.key}</span>
                          </button>
                        ))}
                      </div>
                      <div className="reason" style={{ visibility: needsReason ? 'visible' : 'hidden' }}>
                        <label className="sr-only" htmlFor={`r-${emp.id}`}>Reason</label>
                        <select id={`r-${emp.id}`} value={rec?.reason_code ?? ''} disabled={!needsReason || saving.has(emp.id)}
                                onChange={e => save(emp, rec!.status, e.target.value || null)}>
                          <option value="">Reason…</option>
                          {ws.reasons.map(r => <option key={r.code} value={r.code}>{r.label}</option>)}
                        </select>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
          <p className="small muted">Tap a status to save it. Tap it again to clear it. Changes save instantly.</p>
        </>
      )}
    </div>
  );
}
