// Turns the server's attendance grid into the dashboard KPIs and the 7 reports.
// Every number on the Reports screen comes from the same grid, so they always agree.
import type { AbsenceReason, AttendanceStatus, Employee } from './types';
import type { WarehouseFull } from './workspace';
import { addDays, formatDate, isoWeekday, todayIn } from './time';

export type GridStatus = AttendanceStatus | 'none';
export interface GridRow { date: string; employeeId: string; shiftId: string | null; status: GridStatus; reason: string | null }

export function parseGrid(raw: unknown): GridRow[] {
  return ((raw ?? []) as [string, string, string | null, GridStatus, string | null][])
    .map(([date, employeeId, shiftId, status, reason]) => ({ date, employeeId, shiftId, status, reason }));
}

// ---------- periods ----------
export type PeriodKey = 'today' | 'yesterday' | 'this_week' | 'last_week' | 'this_month' | 'last_month' | 'custom';
export const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: 'today', label: 'Today' }, { key: 'yesterday', label: 'Yesterday' },
  { key: 'this_week', label: 'This week' }, { key: 'last_week', label: 'Last week' },
  { key: 'this_month', label: 'This month' }, { key: 'last_month', label: 'Last month' },
  { key: 'custom', label: 'Custom dates' },
];
export const MAX_RANGE_DAYS = 92;

export function periodRange(key: PeriodKey, tz: string, custom?: { from: string; to: string }): { from: string; to: string } {
  const today = todayIn(tz);
  const monday = addDays(today, 1 - isoWeekday(today));
  const firstOfMonth = today.slice(0, 8) + '01';
  switch (key) {
    case 'today': return { from: today, to: today };
    case 'yesterday': return { from: addDays(today, -1), to: addDays(today, -1) };
    case 'this_week': return { from: monday, to: today };
    case 'last_week': return { from: addDays(monday, -7), to: addDays(monday, -1) };
    case 'this_month': return { from: firstOfMonth, to: today };
    case 'last_month': {
      const lastDay = addDays(firstOfMonth, -1);
      return { from: lastDay.slice(0, 8) + '01', to: lastDay };
    }
    default: return custom ?? { from: today, to: today };
  }
}

export function rangeLabel(from: string, to: string): string {
  const short: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };
  return from === to ? formatDate(from, { weekday: 'long', ...short }) : `${formatDate(from, short)} – ${formatDate(to, short)}`;
}

// ---------- totals ----------
export interface Tally { scheduled: number; present: number; late: number; absent: number; excused: number; none: number }
export const emptyTally = (): Tally => ({ scheduled: 0, present: 0, late: 0, absent: 0, excused: 0, none: 0 });
export function add(t: Tally, s: GridStatus) { t.scheduled++; t[s]++; }
// Attendance rate: worked (present + late) out of every scheduled employee-day.
export const rate = (t: Tally) => (t.scheduled ? (t.present + t.late) / t.scheduled : null);
export const pct = (r: number | null) => (r === null ? '—' : `${Math.round(r * 1000) / 10}%`);

// ---------- report tables ----------
export type Cell = string | number;
export interface ReportTable {
  key: ReportKey;
  title: string;
  description: string;
  columns: string[];
  rows: Cell[][];
  numeric?: number[];          // column indexes aligned right
  wide?: boolean;              // landscape PDF
}

export type ReportKey = 'daily' | 'summary' | 'absences' | 'late' | 'no_record' | 'by_employee' | 'new';
export const REPORTS: { key: ReportKey; label: string }[] = [
  { key: 'daily', label: 'Daily attendance' },
  { key: 'summary', label: 'Summary by day and shift' },
  { key: 'absences', label: 'Absences' },
  { key: 'late', label: 'Late arrivals' },
  { key: 'no_record', label: 'No record' },
  { key: 'by_employee', label: 'By employee' },
  { key: 'new', label: 'New employees' },
];

const STATUS_LABEL: Record<GridStatus, string> = { present: 'Present', late: 'Late', absent: 'Absent', excused: 'Excused', none: 'No record' };

export interface ReportInput {
  grid: GridRow[];
  employees: Map<string, Employee>;
  warehouses: WarehouseFull[];
  reasons: AbsenceReason[];
  from: string;
  to: string;
  warehouseId: string | null;     // null = all visible warehouses
  shiftId: string | null;         // null = all shifts
}

export interface ReportSet {
  tally: Tally;
  newEmployees: Employee[];
  byReason: { label: string; count: number }[];
  tables: Record<ReportKey, ReportTable>;
}

const d = (iso: string) => formatDate(iso, { month: '2-digit', day: '2-digit', year: 'numeric' });

export function buildReports(inp: ReportInput): ReportSet {
  const shiftName = new Map<string, string>();
  const shiftOrder = new Map<string, number>();
  const deptName = new Map<string, string>();
  inp.warehouses.forEach(w => {
    w.shifts.forEach((s, i) => { shiftName.set(s.id!, s.name); shiftOrder.set(s.id!, i); });
    w.departments.forEach(x => deptName.set(x.id, x.name));
  });
  const reasonLabel = new Map(inp.reasons.map(r => [r.code, r.label]));
  const sName = (id: string | null) => (id ? shiftName.get(id) ?? '—' : '—');
  const emp = (id: string) => inp.employees.get(id);
  const name = (id: string) => { const e = emp(id); return e ? `${e.last_name}, ${e.first_name}` : 'Unknown'; };
  const badge = (id: string) => emp(id)?.employee_code ?? '';
  const dept = (id: string) => { const e = emp(id); return e?.department_id ? deptName.get(e.department_id) ?? '' : ''; };

  // The record's shift decides (a shift change never rewrites history).
  const grid = inp.grid
    .filter(r => !inp.shiftId || r.shiftId === inp.shiftId)
    .sort((a, b) => a.date.localeCompare(b.date)
      || (shiftOrder.get(a.shiftId ?? '') ?? 99) - (shiftOrder.get(b.shiftId ?? '') ?? 99)
      || name(a.employeeId).localeCompare(name(b.employeeId)));

  const tally = emptyTally();
  grid.forEach(r => add(tally, r.status));

  // 1. Daily attendance
  const daily: ReportTable = {
    key: 'daily', title: 'Daily attendance', wide: true,
    description: 'Every scheduled employee for each day, with their status and reason.',
    columns: ['Date', 'Shift', 'Badge ID', 'Name', 'Department', 'Status', 'Reason'],
    rows: grid.map(r => [d(r.date), sName(r.shiftId), badge(r.employeeId), name(r.employeeId), dept(r.employeeId),
                         STATUS_LABEL[r.status], r.reason ? reasonLabel.get(r.reason) ?? r.reason : '']),
  };

  // 2. Summary by day and shift
  const byDayShift = new Map<string, { date: string; shift: string | null; t: Tally }>();
  grid.forEach(r => {
    const k = `${r.date}|${r.shiftId}`;
    if (!byDayShift.has(k)) byDayShift.set(k, { date: r.date, shift: r.shiftId, t: emptyTally() });
    add(byDayShift.get(k)!.t, r.status);
  });
  const summaryRows: Cell[][] = [...byDayShift.values()].map(x => [d(x.date), sName(x.shift), x.t.scheduled, x.t.present,
    x.t.late, x.t.absent, x.t.excused, x.t.none, pct(rate(x.t))]);
  if (summaryRows.length > 1) summaryRows.push(['Total', '', tally.scheduled, tally.present, tally.late, tally.absent, tally.excused, tally.none, pct(rate(tally))]);
  const summary: ReportTable = {
    key: 'summary', title: 'Summary by day and shift',
    description: 'Totals for each day and shift. Attendance = present + late, out of everyone scheduled.',
    columns: ['Date', 'Shift', 'Scheduled', 'Present', 'Late', 'Absent', 'Excused', 'No record', 'Attendance'],
    numeric: [2, 3, 4, 5, 6, 7, 8], rows: summaryRows,
  };

  // 3. Absences (absent + excused) and the count per reason
  const absRows = grid.filter(r => r.status === 'absent' || r.status === 'excused');
  const reasonCount = new Map<string, number>();
  absRows.forEach(r => { const l = r.reason ? reasonLabel.get(r.reason) ?? r.reason : 'No reason given'; reasonCount.set(l, (reasonCount.get(l) ?? 0) + 1); });
  const absences: ReportTable = {
    key: 'absences', title: 'Absences', wide: true,
    description: 'Everyone marked absent or excused, with the reason category.',
    columns: ['Date', 'Shift', 'Badge ID', 'Name', 'Department', 'Status', 'Reason'],
    rows: absRows.map(r => [d(r.date), sName(r.shiftId), badge(r.employeeId), name(r.employeeId), dept(r.employeeId),
                            STATUS_LABEL[r.status], r.reason ? reasonLabel.get(r.reason) ?? r.reason : '']),
  };

  // 4. Late arrivals, with each person's count in the period
  const lateRows = grid.filter(r => r.status === 'late');
  const lateCount = new Map<string, number>();
  lateRows.forEach(r => lateCount.set(r.employeeId, (lateCount.get(r.employeeId) ?? 0) + 1));
  const late: ReportTable = {
    key: 'late', title: 'Late arrivals',
    description: 'Everyone marked late, and how many times each person was late in this period.',
    columns: ['Date', 'Shift', 'Badge ID', 'Name', 'Department', 'Times late in period'], numeric: [5],
    rows: lateRows.map(r => [d(r.date), sName(r.shiftId), badge(r.employeeId), name(r.employeeId), dept(r.employeeId), lateCount.get(r.employeeId) ?? 1]),
  };

  // 5. No record: scheduled, but nobody marked them
  const noRecord: ReportTable = {
    key: 'no_record', title: 'No record',
    description: 'Scheduled employees with no attendance marked. Today’s list fills in as attendance is taken.',
    columns: ['Date', 'Shift', 'Badge ID', 'Name', 'Department'],
    rows: grid.filter(r => r.status === 'none').map(r => [d(r.date), sName(r.shiftId), badge(r.employeeId), name(r.employeeId), dept(r.employeeId)]),
  };

  // 6. By employee
  const perEmp = new Map<string, Tally>();
  grid.forEach(r => { if (!perEmp.has(r.employeeId)) perEmp.set(r.employeeId, emptyTally()); add(perEmp.get(r.employeeId)!, r.status); });
  const byEmployee: ReportTable = {
    key: 'by_employee', title: 'By employee', wide: true,
    description: 'Each person’s totals for the period, counted by badge ID.',
    columns: ['Badge ID', 'Name', 'Shift', 'Department', 'Scheduled', 'Present', 'Late', 'Absent', 'Excused', 'No record', 'Attendance'],
    numeric: [4, 5, 6, 7, 8, 9, 10],
    rows: [...perEmp.entries()].sort((a, b) => name(a[0]).localeCompare(name(b[0]))).map(([id, t]) =>
      [badge(id), name(id), sName(emp(id)?.shift_id ?? null), dept(id), t.scheduled, t.present, t.late, t.absent, t.excused, t.none, pct(rate(t))]),
  };

  // 7. New employees: first day worked falls in the period
  const whIds = new Set(inp.warehouseId ? [inp.warehouseId] : inp.warehouses.map(w => w.id));
  const newEmployees = [...inp.employees.values()].filter(e =>
    whIds.has(e.warehouse_id) && (!inp.shiftId || e.shift_id === inp.shiftId)
    && e.first_attendance_date && e.first_attendance_date >= inp.from && e.first_attendance_date <= inp.to)
    .sort((a, b) => a.first_attendance_date!.localeCompare(b.first_attendance_date!) || a.last_name.localeCompare(b.last_name));
  const newTable: ReportTable = {
    key: 'new', title: 'New employees',
    description: 'People whose first day worked (first present or late) falls in this period.',
    columns: ['First day', 'Badge ID', 'Name', 'Shift', 'Department', 'Hire date'],
    rows: newEmployees.map(e => [d(e.first_attendance_date!), e.employee_code, `${e.last_name}, ${e.first_name}`, sName(e.shift_id),
      e.department_id ? deptName.get(e.department_id) ?? '' : '', e.hire_date ? d(e.hire_date) : '']),
  };

  return {
    tally, newEmployees,
    byReason: [...reasonCount.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count),
    tables: { daily, summary, absences, late, no_record: noRecord, by_employee: byEmployee, new: newTable },
  };
}
