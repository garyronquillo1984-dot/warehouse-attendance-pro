import type { Homework, ParentStatus } from './types';
import { addDays } from './dates';
import { HISTORY_DAYS } from './config';

/** Status for this parent: the official lifecycle combined with the personal "completed" mark. */
export function parentStatus(h: Homework, today: string, markedOn: string | null): ParentStatus {
  if (markedOn) return 'completed';
  if (h.start_date > today) return 'upcoming';
  if (h.due_date >= today) return 'pending';
  return h.due_date >= addDays(today, -HISTORY_DAYS) ? 'overdue' : 'archived';
}

/** Active on a given day: assigned on or before it and due on or after it. */
export const activeOn = (h: Homework, day: string) => h.start_date <= day && h.due_date >= day;

/** Today's view only brings back homework that was due in the last few days (Friday → Monday). */
export const TODAY_OVERDUE_DAYS = 3;

/**
 * Today's homework: everything active today, plus homework due in the last 3 days that was not
 * marked (overdue), plus such homework marked today (so finishing it shows as progress). Older
 * unmarked homework is not counted here: it appears as overdue in "Last 2 weeks" and in the archive.
 */
export function inToday(h: Homework, today: string, markedOn: string | null): boolean {
  if (activeOn(h, today)) return true;
  if (h.due_date >= today || h.due_date < addDays(today, -TODAY_OVERDUE_DAYS)) return false;
  return !markedOn || markedOn === today;
}

/** Stable order (subject, then due date) — never depends on the status, so nothing jumps. */
export const stableOrder = (a: Homework, b: Homework) =>
  a.due_date.localeCompare(b.due_date) || a.subject.localeCompare(b.subject) || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id);
