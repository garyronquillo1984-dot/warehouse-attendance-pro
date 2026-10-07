import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useOrg, canManage } from '../lib/org';
import { useWorkspace, pickWarehouse } from '../lib/workspace';
import { friendlyError } from '../lib/errors';
import {
  readFile, detectColumns, mapRows, FIELD_LABELS, IMPORT_ERRORS, TEMPLATE_CSV,
  type Field, type ImportRow, type ParsedFile,
} from '../lib/import';
import { Loading, Notice } from '../components/ui';

type Kind = 'new' | 'update' | 'same' | 'problem';
interface Checked extends ImportRow { kind: Kind; problem?: string }

interface Existing { employee_code: string; warehouse_id: string; first_name: string; last_name: string }

interface Result { total: number; new: number; updated: number; unchanged: number; errors: { row: number; badge?: string; error: string; value?: string }[] }

const FIELDS: Field[] = ['employee_code', 'first_name', 'last_name', 'full_name', 'shift', 'department', 'hire_date', 'status'];

export default function ImportEmployees() {
  const { current } = useOrg();
  const ws = useWorkspace(current?.organization_id);
  const [params, setParams] = useSearchParams();
  const wh = pickWarehouse(ws.warehouses, params.get('wh'));

  const [fileName, setFileName] = useState('');
  const [parsed, setParsed] = useState<ParsedFile | null>(null);
  const [cols, setCols] = useState<Partial<Record<Field, number>>>({});
  const [existing, setExisting] = useState<Existing[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    if (!current) return;
    supabase.from('employees').select('employee_code, warehouse_id, first_name, last_name')
      .eq('organization_id', current.organization_id).limit(10000)
      .then(({ data }) => setExisting((data ?? []) as Existing[]));
  }, [current, result]);

  const rows = useMemo<Checked[]>(() => {
    if (!parsed || !wh) return [];
    const mapped = mapRows(parsed, cols);
    const byBadge = new Map((existing ?? []).map(e => [e.employee_code, e]));
    const shiftNames = new Set(wh.shifts.map(s => s.name.toLowerCase()));
    const seen = new Set<string>();
    return mapped.map(r => {
      let problem: string | undefined;
      if (!r.employee_code) problem = IMPORT_ERRORS.missing_badge;
      else if (seen.has(r.employee_code)) problem = IMPORT_ERRORS.duplicate_in_file;
      else if (!r.first_name || !r.last_name) problem = IMPORT_ERRORS.missing_name;
      else if (r.shift && !shiftNames.has(r.shift.toLowerCase())) problem = `${IMPORT_ERRORS.unknown_shift} (“${r.shift}”)`;
      else if (r.hire_date && !/^\d{4}-\d{2}-\d{2}$/.test(r.hire_date)) problem = `${IMPORT_ERRORS.bad_date} (“${r.hire_date}”)`;
      seen.add(r.employee_code);
      const ex = byBadge.get(r.employee_code);
      if (!problem && ex && ex.warehouse_id !== wh.id) problem = IMPORT_ERRORS.other_warehouse;
      if (problem) return { ...r, kind: 'problem' as const, problem };
      if (!ex) return { ...r, kind: 'new' as const };
      return { ...r, kind: (ex.first_name === r.first_name && ex.last_name === r.last_name ? 'same' : 'update') as Kind };
    });
  }, [parsed, cols, existing, wh]);

  if (!canManage(current)) return <Navigate to="/employees" replace />;
  if (ws.loading || !existing) return <Loading />;
  if (!wh) return <Notice kind="info">Add a warehouse in Settings first.</Notice>;

  const counts = { new: 0, update: 0, same: 0, problem: 0 } as Record<Kind, number>;
  rows.forEach(r => counts[r.kind]++);
  const importable = rows.filter(r => r.kind !== 'problem');

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setError(null); setResult(null); setParsed(null);
    try {
      const p = await readFile(f);
      setFileName(f.name);
      setParsed(p);
      setCols(detectColumns(p.header));
    } catch (err) {
      const m = err instanceof Error ? err.message : '';
      setError(m === 'OLD_EXCEL' ? 'This is an old Excel file (.xls). In Excel choose File → Save As → Excel Workbook (.xlsx), then try again.'
        : m === 'UNSUPPORTED_FILE' ? 'Choose an Excel file (.xlsx) or a CSV file.'
        : 'We couldn’t read that file. Make sure it isn’t password-protected, then try again.');
    }
  }

  async function runImport() {
    setBusy(true); setError(null);
    const payload = importable.map(r => ({
      employee_code: r.employee_code, first_name: r.first_name, last_name: r.last_name,
      shift: r.shift, department: r.department, hire_date: r.hire_date, status: r.status,
    }));
    const { data, error: err } = await supabase.rpc('import_employees', { org: wh!.organization_id, wh: wh!.id, file_name: fileName, rows: payload });
    setBusy(false);
    if (err) return setError(friendlyError(err));
    setResult(data as Result);
    setParsed(null);
    ws.reload();
  }

  function downloadTemplate() {
    const url = URL.createObjectURL(new Blob([TEMPLATE_CSV], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url; a.download = 'employees-template.csv'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const missingRequired = parsed && (cols.employee_code === undefined
    || ((cols.first_name === undefined || cols.last_name === undefined) && cols.full_name === undefined));

  return (
    <div className="stack-lg">
      <div className="page-head">
        <Link to={`/employees?wh=${wh.id}`} className="small back">‹ Employees</Link>
        <h1>Import employees</h1>
        <p className="muted">Add or update your roster from Excel or CSV. People are matched by badge ID: a badge already in
          the list updates that person, a new badge adds someone. Nobody is deleted.</p>
      </div>

      {error && <Notice kind="error">{error}</Notice>}

      {result && (
        <section className="panel">
          <h2>Import finished</h2>
          <dl className="kv">
            <dt>Added</dt><dd>{result.new}</dd>
            <dt>Updated</dt><dd>{result.updated}</dd>
            <dt>Already up to date</dt><dd>{result.unchanged}</dd>
            {result.errors.length > 0 && <><dt>Skipped</dt><dd>{result.errors.length}</dd></>}
          </dl>
          {result.errors.length > 0 && (
            <ul className="small">
              {result.errors.map(e => <li key={e.row}>Row {e.row}{e.badge ? ` (badge ${e.badge})` : ''}: {IMPORT_ERRORS[e.error] ?? e.error}</li>)}
            </ul>
          )}
          <div className="row">
            <Link className="btn btn-primary" to={`/employees?wh=${wh.id}`}>See employees</Link>
            <button className="btn btn-ghost" onClick={() => setResult(null)}>Import another file</button>
          </div>
        </section>
      )}

      {!result && (
        <section className="panel">
          <h2>1. Choose the file</h2>
          {ws.warehouses.length > 1 && (
            <div className="field" style={{ maxWidth: 320 }}>
              <label htmlFor="imp-wh">Import into warehouse</label>
              <select id="imp-wh" value={wh.id} onChange={e => setParams({ wh: e.target.value }, { replace: true })}>
                {ws.warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>
          )}
          <p>Needs a <strong>Badge ID</strong> column and the name (first and last, or one full-name column). Shift,
             department and hire date are optional. Shift names must match the shifts of {wh.name}:{' '}
             {wh.shifts.map(s => s.name).join(', ') || 'none yet'}.</p>
          <div className="row">
            <label className="btn btn-primary file-btn">
              {parsed ? 'Choose a different file' : 'Choose file'}
              <input type="file" accept=".xlsx,.csv,.txt,.xls" onChange={onFile} />
            </label>
            <button type="button" className="btn-link" onClick={downloadTemplate}>Download a template</button>
          </div>
          {fileName && parsed && <p className="small muted">{fileName}: {rows.length} rows found</p>}
        </section>
      )}

      {parsed && !result && (
        <section className="panel">
          <h2>2. Check the columns</h2>
          <p className="muted">We matched your columns automatically. Change any that are wrong.</p>
          <div className="colmap">
            {FIELDS.map(f => (
              <div className="field" key={f}>
                <label htmlFor={`col-${f}`}>{FIELD_LABELS[f]}</label>
                <select id={`col-${f}`} value={cols[f] ?? ''} onChange={e => setCols({ ...cols, [f]: e.target.value === '' ? undefined : Number(e.target.value) })}>
                  <option value="">Not in file</option>
                  {parsed.header.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}
                </select>
              </div>
            ))}
          </div>
          {missingRequired && <Notice kind="error">Pick the Badge ID column and the name column(s) to continue.</Notice>}
        </section>
      )}

      {parsed && !result && !missingRequired && (
        <section className="panel flush">
          <div className="pad stack">
            <h2>3. Review and import</h2>
            <ul className="chips" aria-label="Summary">
              <li className="chip chip-go">{counts.new} new</li>
              <li className="chip">{counts.update} name changes</li>
              <li className="chip">{counts.same} already in the list</li>
              {counts.problem > 0 && <li className="chip chip-stop">{counts.problem} with problems (skipped)</li>}
            </ul>
          </div>
          <div className="table-scroll">
            <table className="emp-table preview">
              <thead><tr><th>Row</th><th>Result</th><th>Badge ID</th><th>Name</th><th>Shift</th><th>Department</th><th>Hire date</th></tr></thead>
              <tbody>
                {rows.slice(0, 300).map(r => (
                  <tr key={r.line} data-kind={r.kind}>
                    <td className="muted">{r.line}</td>
                    <td>{r.kind === 'new' ? 'New' : r.kind === 'update' ? 'Name change' : r.kind === 'same' ? 'Already in list' : <span className="problem">{r.problem}</span>}</td>
                    <td className="mono">{r.employee_code}</td>
                    <td>{r.last_name}{r.last_name && r.first_name ? ', ' : ''}{r.first_name}</td>
                    <td>{r.shift}</td>
                    <td>{r.department}</td>
                    <td>{r.hire_date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length > 300 && <p className="small muted pad">Showing the first 300 of {rows.length} rows.</p>}
          <div className="row pad">
            <button className="btn btn-primary" disabled={busy || !importable.length} onClick={runImport}>
              {busy ? 'Importing…' : `Import ${importable.length} employee${importable.length === 1 ? '' : 's'}`}
            </button>
            {counts.problem > 0 && <span className="small muted">Rows with problems are skipped. Fix them in your file and import again.</span>}
          </div>
        </section>
      )}
    </div>
  );
}
