// Dates as plain "YYYY-MM-DD" strings in the parent's local time: due dates are calendar days,
// not instants, so no time-zone conversion ever shifts them.
import type { Task } from './types';

const pad = (n: number) => String(n).padStart(2, '0');
export const toIso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayIso = () => toIso(new Date());
export const parseIso = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (s: string, n: number) => { const d = parseIso(s); d.setDate(d.getDate() + n); return toIso(d); };
export const isoDow = (s: string) => { const w = parseIso(s).getDay(); return w === 0 ? 7 : w; };   // Monday = 1
export const mondayOf = (s: string) => addDays(s, 1 - isoDow(s));
export const daysBetween = (a: string, b: string) => Math.round((parseIso(b).getTime() - parseIso(a).getTime()) / 864e5);
export const localDay = (instant: string | null) => instant ? toIso(new Date(instant)) : null;

export const isDone = (t: Task) => t.status === 'completed';
export const isOverdue = (t: Task, today: string) => !isDone(t) && !!t.due_date && t.due_date < today;

// "Today's work": due today, still-open overdue tasks, and overdue tasks finished today
// (so catching up moves the progress bar).
export const inTodaysWork = (t: Task, today: string) =>
  t.due_date === today || isOverdue(t, today) || (isDone(t) && !!t.due_date && t.due_date < today && localDay(t.completed_at) === today);

export type Urgency = 'overdue' | 'today' | 'soon' | 'scheduled' | 'calm' | 'none' | 'done';
export function urgencyOf(t: Task, today: string): Urgency {
  if (isDone(t)) return 'done';
  if (!t.due_date) return 'none';
  const d = daysBetween(today, t.due_date);
  if (d < 0) return 'overdue';
  if (d === 0) return 'today';
  if (d === 1) return 'soon';
  if (d <= 7) return 'scheduled';
  return 'calm';
}

// Stable order that does NOT depend on status, so ticking a task never moves it.
export function byDueThenCreated(a: Task, b: Task) {
  return (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999')
    || (a.priority === b.priority ? 0 : a.priority === 'high' ? -1 : b.priority === 'high' ? 1 : a.priority === 'low' ? 1 : -1)
    || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id);
}

export function fmtDate(s: string, locale: string, opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' }) {
  return new Intl.DateTimeFormat(locale, opts).format(parseIso(s));
}
// Sentence case ("Miércoles, 7 de octubre"): CSS capitalize would also raise "De".
export const capFirst = (s: string) => s.charAt(0).toLocaleUpperCase() + s.slice(1);
export const fmtLong = (s: string, locale: string) => capFirst(fmtDate(s, locale, { weekday: 'long', day: 'numeric', month: 'long' }));
export const fmtDateTime = (instant: string, locale: string) =>
  new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(instant));

// Whole days left until an instant, rounding up (6.2 days → 7), never negative.
export const daysLeft = (instant: string | null) =>
  instant ? Math.max(0, Math.ceil((new Date(instant).getTime() - Date.now()) / 864e5)) : 0;
