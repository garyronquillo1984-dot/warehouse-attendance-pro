import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useOrg } from '../lib/org';
import { useWorkspace } from '../lib/workspace';
import { daysBetween, todayIn } from '../lib/time';
import { friendlyError } from '../lib/errors';
import { EMPLOYEE_COLUMNS, type Employee } from '../lib/types';
import {
  PERIODS, REPORTS, MAX_RANGE_DAYS, periodRange, rangeLabel, parseGrid, buildReports, rate, pct,
  type GridRow, type PeriodKey, type ReportKey,
} from '../lib/reports';
import { exportCsv, exportPdf, exportXlsx, type ExportContext } from '../lib/export';
import { Loading, Notice } from '../components/ui';

const SHOW_ROWS = 300;

export default function Reports() {
  const { current } = useOrg();
  const ws = useWorkspace(current?.organization_id);
  const [params, setParams] = useSearchParams();
  const tz = ws.timezone;
  const today = todayIn(tz);

  const period = (params.get('period') as PeriodKey) || 'this_week';
  const custom = { from: params.get('from') || today, to: params.get('to') || today };
  const { from, to } = periodRange(period, tz, custom);
  const whId = params.get('wh') && ws.warehouses.some(w => w.id === params.get('wh')) ? params.get('wh') : null;
  const shiftId = params.get('shift') || null;
  const reportKey = (params.get('report') as ReportKey) || 'daily';

  const [grid, setGrid] = useState<GridRow[] | null>(null);
  const [employees, setEmployees] = useState<Map<string, Employee>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);

  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) { if (v) next.set(k, v); else next.delete(k); }
    setParams(next, { replace: true });
  };

  const rangeError = to < from ? 'The end date is before the start date.'
    : daysBetween(from, to) > MAX_RANGE_DAYS ? `Choose up to ${MAX_RANGE_DAYS + 1} days at a time (about 3 months).`
    : to > today ? 'Reports can’t include future dates.' : null;

  useEffect(() => {
    if (!current || ws.loading || rangeError) return;
    let stale = false;
    setGrid(null); setError(null);
    (async () => {
      const [g, e] = await Promise.all([
        supabase.rpc('report_grid', { org: current.organization_id, wh: whId, d_from: from, d_to: to }),
        supabase.from('employees').select(EMPLOYEE_COLUMNS).eq('organization_id', current.organization_id).limit(10000),
      ]);
      if (stale) return;
      if (g.error || e.error) setError(friendlyError(g.error || e.error));
      setGrid(parseGrid(g.data));
      setEmployees(new Map(((e.data ?? []) as Employee[]).map(x => [x.id, x])));
    })();
    return () => { stale = true; };
  }, [current, ws.loading, whId, from, to, rangeError]);

  const shiftsInScope = useMemo(() => (whId ? ws.warehouses.filter(w => w.id === whId) : ws.warehouses)
    .flatMap(w => w.shifts.map(s => ({ id: s.id!, name: ws.warehouses.length > 1 && !whId ? `${s.name} (${w.name})` : s.name }))), [ws.warehouses, whId]);

  const set5 = useMemo(() => grid && buildReports({
    grid, employees, warehouses: ws.warehouses, reasons: ws.reasons, from, to, warehouseId: whId, shiftId,
  }), [grid, employees, ws.warehouses, ws.reasons, from, to, whId, shiftId]);

  if (!current || ws.loading) return <Loading />;
  if (!ws.warehouses.length) return <Notice kind="info">You don’t have access to a warehouse yet.</Notice>;

  const table = set5?.tables[reportKey];
  const scope = [whId ? ws.warehouses.find(w => w.id === whId)?.name : ws.warehouses.length > 1 ? 'All warehouses' : ws.warehouses[0].name,
                 shiftId ? shiftsInScope.find(s => s.id === shiftId)?.name : 'All shifts'].join(' · ');
  const ctx: ExportContext = { company: current.name, scope, period: rangeLabel(from, to), from, to };

  async function run(kind: 'csv' | 'xlsx' | 'pdf') {
    if (!table) return;
    setExporting(kind);
    try {
      if (kind === 'csv') exportCsv(table, ctx);
      else if (kind === 'xlsx') await exportXlsx(table, ctx);
      else await exportPdf(table, ctx);
    } catch (err) {
      setError(`Couldn’t create the file: ${friendlyError(err)}`);
    } finally {
      setExporting(null);
    }
  }

  const t = set5?.tally;
  return (
    <div className="stack-lg">
      <div className="page-head">
        <h1>Reports</h1>
        <p className="muted">{rangeLabel(from, to)} · {scope}</p>
      </div>

      <div className="filters">
        <div className="field">
          <label htmlFor="r-period">Period</label>
          <select id="r-period" value={period} onChange={e => set({ period: e.target.value, from: e.target.value === 'custom' ? from : null, to: e.target.value === 'custom' ? to : null })}>
            {PERIODS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
        </div>
        {period === 'custom' && (
          <>
            <div className="field">
              <label htmlFor="r-from">From</label>
              <input id="r-from" type="date" value={from} max={today} onChange={e => e.target.value && set({ from: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="r-to">To</label>
              <input id="r-to" type="date" value={to} max={today} onChange={e => e.target.value && set({ to: e.target.value })} />
            </div>
          </>
        )}
        {ws.warehouses.length > 1 && (
          <div className="field">
            <label htmlFor="r-wh">Warehouse</label>
            <select id="r-wh" value={whId ?? ''} onChange={e => set({ wh: e.target.value, shift: null })}>
              <option value="">All warehouses</option>
              {ws.warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
        )}
        <div className="field">
          <label htmlFor="r-shift">Shift</label>
          <select id="r-shift" value={shiftId ?? ''} onChange={e => set({ shift: e.target.value })}>
            <option value="">All shifts</option>
            {shiftsInScope.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      </div>

      {rangeError && <Notice kind="error">{rangeError}</Notice>}
      {error && <Notice kind="error">{error}</Notice>}

      {!rangeError && (!set5 ? <Loading label="Adding up attendance…" /> : (
        <>
          <section className="kpis" aria-label="Totals for this period">
            <div className="kpi kpi-main">
              <span className="kpi-label">Attendance</span>
              <span className="kpi-value">{pct(rate(t!))}</span>
              <span className="kpi-note">{t!.present + t!.late} of {t!.scheduled} scheduled</span>
            </div>
            <div className="kpi"><span className="kpi-label">Present</span><span className="kpi-value t-present">{t!.present}</span></div>
            <div className="kpi"><span className="kpi-label">Late</span><span className="kpi-value">{t!.late}</span></div>
            <div className="kpi"><span className="kpi-label">Absent</span><span className="kpi-value t-absent">{t!.absent}</span></div>
            <div className="kpi"><span className="kpi-label">Excused</span><span className="kpi-value">{t!.excused}</span></div>
            <div className="kpi"><span className="kpi-label">No record</span><span className="kpi-value">{t!.none}</span></div>
            <div className="kpi"><span className="kpi-label">New employees</span><span className="kpi-value">{set5.newEmployees.length}</span></div>
          </section>

          <nav className="report-tabs" aria-label="Reports">
            {REPORTS.map(r => (
              <button key={r.key} type="button" aria-pressed={reportKey === r.key} onClick={() => set({ report: r.key === 'daily' ? null : r.key })}>
                {r.label} <span className="count">{set5.tables[r.key].rows.length}</span>
              </button>
            ))}
          </nav>

          {table && (
            <section className="panel flush">
              <div className="pad report-head">
                <div className="stack" style={{ gap: 4 }}>
                  <h2>{table.title}</h2>
                  <p className="muted small">{table.description}</p>
                </div>
                <div className="row export" role="group" aria-label="Download">
                  <span className="small muted">Download</span>
                  <button className="btn btn-ghost" disabled={!!exporting} onClick={() => run('csv')}>CSV</button>
                  <button className="btn btn-ghost" disabled={!!exporting} onClick={() => run('xlsx')}>{exporting === 'xlsx' ? 'Preparing…' : 'Excel'}</button>
                  <button className="btn btn-ghost" disabled={!!exporting} onClick={() => run('pdf')}>{exporting === 'pdf' ? 'Preparing…' : 'PDF'}</button>
                </div>
              </div>
              {reportKey === 'absences' && set5.byReason.length > 0 && (
                <ul className="chips pad" style={{ paddingTop: 0 }} aria-label="Absences by reason">
                  {set5.byReason.map(r => <li key={r.label} className="chip">{r.label} <strong>{r.count}</strong></li>)}
                </ul>
              )}
              {!table.rows.length ? (
                <p className="muted pad">Nothing to show for this period.</p>
              ) : (
                <div className="table-scroll">
                  <table className="report-table">
                    <thead><tr>{table.columns.map((c, i) => <th key={c} className={table.numeric?.includes(i) ? 'num' : undefined}>{c}</th>)}</tr></thead>
                    <tbody>
                      {table.rows.slice(0, SHOW_ROWS).map((r, i) => (
                        <tr key={i} data-total={r[0] === 'Total' || undefined}>
                          {r.map((v, j) => <td key={j} className={table.numeric?.includes(j) ? 'num' : undefined}
                                              data-status={table.columns[j] === 'Status' ? String(v) : undefined}>{v}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {table.rows.length > SHOW_ROWS && (
                <p className="small muted pad">Showing the first {SHOW_ROWS} of {table.rows.length} rows. Downloads include all of them.</p>
              )}
            </section>
          )}
        </>
      ))}
    </div>
  );
}
