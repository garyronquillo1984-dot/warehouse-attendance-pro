// Business rules shared by the database layer and the API:
// unique task keys, "completed" detection, and the Pendiente/Próxima/Vencida/Archivo buckets.
import crypto from 'node:crypto';
import { todayISO, daysBetween, addDays } from './dates.js';
import { config } from './config.js';

export function normalizeText(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Stable content key: same student + subject + title + assigned date ⇒ same task.
 * The due date is deliberately left out when an assigned date exists, because
 * teachers reschedule due dates and that must update the task, not duplicate it.
 */
export function contentKey(t) {
  const parts = [
    normalizeText(t.student),
    normalizeText(t.subject),
    normalizeText(t.title),
    t.assignedDate || `due:${t.dueDate || ''}`,
  ];
  return 'h_' + crypto.createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 20);
}

export function idukayKey(t) {
  if (!t.idukayId) return null;
  return 'i_' + crypto.createHash('sha256').update(`${normalizeText(t.student)}|${t.idukayId}`).digest('hex').slice(0, 20);
}

const NEGATIVE = /\b(no entregad|sin entregar|no realizad|pendiente|por entregar|not submitted|missing|atrasad|vigente|no calificad)/i;
const POSITIVE = /\b(entregad[ao]|completad[ao]|realizad[ao]|calificad[ao]|revisad[ao]|submitted|delivered|turned in|completed|done)\b/i;

/** True only when Idukay itself says the work was delivered/completed. */
export function completedFromIdukay(statusText, flags = {}) {
  if (flags.completed === true || flags.delivered === true) return true;
  if (!statusText) return false;
  if (NEGATIVE.test(statusText)) return false;
  return POSITIVE.test(statusText);
}

/**
 * Bucket for the main screen.
 *  - archivo:    the due date is in the past (kept, never deleted)
 *  - completada: Idukay says it was delivered/completed
 *  - pendiente:  due today or tomorrow (or no due date) → work to do now
 *  - proxima:    due later
 */
export function classify(task, today = todayISO()) {
  const due = task.dueDate;
  const completed = Boolean(task.completedByIdukay);
  let archived = false;
  if (due) archived = due < today;
  else {
    const seen = (task.assignedDate || (task.firstSeenAt || '').slice(0, 10));
    archived = Boolean(seen) && seen < addDays(today, -config.historyDays);
  }
  let bucket;
  if (archived) bucket = 'archivo';
  else if (completed) bucket = 'completada';
  else if (!due) bucket = 'pendiente';
  else bucket = daysBetween(today, due) <= 1 ? 'pendiente' : 'proxima';

  let status;
  if (completed) status = 'completada';
  else if (archived && due) status = 'vencida';
  else if (bucket === 'pendiente') status = 'pendiente';
  else if (bucket === 'proxima') status = 'proxima';
  else status = 'archivada';

  return { bucket, status, daysLeft: due ? daysBetween(today, due) : null };
}

/** Subjects that are taught in English (from the original Artifact). */
export function isEnglish(subject) {
  return /^\s*(science|language arts|english|social studies|cambridge|ela\b|phonics|spelling)/i.test(subject || '');
}
