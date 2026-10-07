export const WEEKDAYS = [
  { n: 1, short: 'Mon' }, { n: 2, short: 'Tue' }, { n: 3, short: 'Wed' }, { n: 4, short: 'Thu' },
  { n: 5, short: 'Fri' }, { n: 6, short: 'Sat' }, { n: 7, short: 'Sun' },
];

const toMinutes = (t: string) => { const [h, m] = t.slice(0, 5).split(':').map(Number); return h * 60 + m; };

export function formatTime(t: string): string {
  const [h, m] = t.slice(0, 5).split(':').map(Number);
  const suffix = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

export function shiftLength(start: string, end: string): { label: string; overnight: boolean } {
  let mins = toMinutes(end) - toMinutes(start);
  const overnight = mins <= 0;
  if (overnight) mins += 24 * 60;
  const h = Math.floor(mins / 60), m = mins % 60;
  return { label: m ? `${h} h ${m} min` : `${h} h`, overnight };
}

export function browserTimezone(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York'; } catch { return 'America/New_York'; }
}

const US_ZONES = ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Phoenix', 'America/Los_Angeles',
  'America/Anchorage', 'Pacific/Honolulu', 'America/Puerto_Rico'];

export function timezoneOptions(current: string): string[] {
  let all: string[] = [];
  try { all = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('timeZone') ?? []; } catch { /* old browser */ }
  const rest = all.filter(z => !US_ZONES.includes(z));
  const list = [...US_ZONES, ...rest];
  return list.includes(current) ? list : [current, ...list];
}

// ---------- dates in the company's time zone ----------
// Work dates are plain YYYY-MM-DD strings; "today" is decided by the company time zone,
// not the device's, so a supervisor travelling still records the warehouse's day.

export function todayIn(tz: string, at: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
}

export function minutesNowIn(tz: string, at: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(at);
  const h = Number(parts.find(p => p.type === 'hour')?.value ?? 0);
  const m = Number(parts.find(p => p.type === 'minute')?.value ?? 0);
  return h * 60 + m;
}

export function addDays(date: string, n: number): string {
  const d = new Date(date + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function isoWeekday(date: string): number {
  const d = new Date(date + 'T12:00:00Z').getUTCDay();
  return d === 0 ? 7 : d;
}

export function formatDate(date: string, opts: Intl.DateTimeFormatOptions = { weekday: 'long', month: 'long', day: 'numeric' }): string {
  return new Date(date + 'T12:00:00Z').toLocaleDateString('en-US', { ...opts, timeZone: 'UTC' });
}

export function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b + 'T12:00:00Z').getTime() - new Date(a + 'T12:00:00Z').getTime()) / 864e5);
}

const mins = (t: string) => { const [h, m] = t.slice(0, 5).split(':').map(Number); return h * 60 + m; };

type ShiftTimes = { start_time: string; end_time: string; late_grace_minutes: number; days: number[] };

// Overnight shifts belong to the day they started: at 00:20 the Second Shift is still "yesterday".
export function workDateFor(shift: ShiftTimes | undefined, tz: string, at: Date = new Date()): string {
  const today = todayIn(tz, at);
  if (!shift) return today;
  const overnight = mins(shift.end_time) <= mins(shift.start_time);
  return overnight && minutesNowIn(tz, at) < mins(shift.end_time) ? addDays(today, -1) : today;
}

// Minutes since the shift started on `workDate` (negative = not started yet).
export function minutesIntoShift(shift: ShiftTimes, workDate: string, tz: string, at: Date = new Date()): number {
  const today = todayIn(tz, at);
  const offset = daysBetween(workDate, today) * 24 * 60;
  return offset + minutesNowIn(tz, at) - mins(shift.start_time);
}

// A badge scanned after start + grace on the shift's own day counts as late.
export function isLateNow(shift: ShiftTimes | undefined, workDate: string, tz: string, at: Date = new Date()): boolean {
  if (!shift) return false;
  const into = minutesIntoShift(shift, workDate, tz, at);
  const len = (mins(shift.end_time) - mins(shift.start_time) + 1440) % 1440 || 1440;
  return into > shift.late_grace_minutes && into <= len;
}

// The shift running now, or else the next one to start today, or else the first.
export function currentShiftId<T extends ShiftTimes & { id?: string; is_active: boolean }>(shifts: T[], tz: string, at: Date = new Date()): string | undefined {
  const active = shifts.filter(s => s.is_active && s.id);
  const now = minutesNowIn(tz, at);
  for (const s of active) {
    const wd = workDateFor(s, tz, at);
    if (!s.days.includes(isoWeekday(wd))) continue;
    const into = minutesIntoShift(s, wd, tz, at);
    const len = (mins(s.end_time) - mins(s.start_time) + 1440) % 1440 || 1440;
    if (into >= -60 && into <= len) return s.id;
  }
  const next = active.filter(s => mins(s.start_time) > now).sort((a, b) => mins(a.start_time) - mins(b.start_time))[0];
  return (next ?? active[0])?.id;
}
