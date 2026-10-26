// Recruiting KPIs, computed from the candidate records, their stage history and attendance.
// Every number is derived from stored facts; nothing is estimated or invented.
import { addDays, daysBetween } from './time';
import { STAGE_INDEX, atLeast, inPool, type Candidate, type Opening, type Source, type Stage, type Task } from './recruiting';

export interface Outcome { candidate_id: string; employee_status: string; first_attendance_date: string | null; last_worked_date: string | null }
export interface StageEvent { candidate_id: string; stage_to: Stage | null; created_at: string }
export interface ContactEvent { candidate_id: string; created_at: string }

export interface Filters { from: string; to: string; sourceId?: string; shift?: string; position?: string; stage?: string; warehouseId?: string }

export function applyFilters(list: Candidate[], f: Filters): Candidate[] {
  return list.filter(c =>
    (!f.sourceId || c.source_id === f.sourceId)
    && (!f.shift || c.shifts_available.includes(f.shift))
    && (!f.position || c.positions_wanted.includes(f.position))
    && (!f.stage || c.stage === f.stage)
    && (!f.warehouseId || c.warehouse_id === f.warehouseId));
}

// Furthest stage each candidate ever reached (closing doesn't erase how far they got).
export function furthest(list: Candidate[], events: StageEvent[]): Map<string, Stage> {
  const best = new Map<string, Stage>();
  const bump = (id: string, s: Stage | null) => {
    if (!s || s === 'closed') return;
    const cur = best.get(id);
    if (!cur || STAGE_INDEX[s] > STAGE_INDEX[cur]) best.set(id, s);
  };
  list.forEach(c => bump(c.id, c.stage));
  events.forEach(e => bump(e.candidate_id, e.stage_to));
  return best;
}

const inRange = (iso: string | null | undefined, from: string, to: string) => !!iso && iso.slice(0, 10) >= from && iso.slice(0, 10) <= to;
const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : null);

export interface Kpis {
  total: number; newToday: number; registered: number;
  contacted: number; interested: number; preselected: number; interviewsScheduled: number; upcomingInterviews: number;
  completed: number; authorized: number; confirmedStarts: number;
  firstDayDue: number; firstDayShowed: number; showRate: number | null;
  retention: { days: number; eligible: number; retained: number; rate: number | null }[];
  avgDaysToFill: number | null; filledOpenings: number;
  contactsToday: number; overdueTasks: number; dueToday: number; stale: number;
}

export function computeKpis(args: {
  all: Candidate[]; filtered: Candidate[]; stageEvents: StageEvent[]; contacts: ContactEvent[]; outcomes: Outcome[];
  tasks: Task[]; openings: Opening[]; f: Filters; today: string; staleDays: number;
}): Kpis {
  const { filtered, stageEvents, contacts, outcomes, tasks, openings, f, today, staleDays } = args;
  const ids = new Set(filtered.map(c => c.id));
  const cohort = filtered.filter(c => inRange(c.registered_at, f.from, f.to));
  const far = furthest(cohort, stageEvents.filter(e => ids.has(e.candidate_id)));
  const reached = (min: Stage) => cohort.filter(c => { const s = far.get(c.id); return !!s && STAGE_INDEX[s] >= STAGE_INDEX[min]; }).length;

  // First day: people whose first day fell in the period and is already past.
  const out = new Map(outcomes.map(o => [o.candidate_id, o]));
  const firstDayPeople = filtered.filter(c => c.first_day && c.first_day >= f.from && c.first_day <= f.to && c.first_day < today
    && (c.employee_id || atLeast(c.stage, 'assigned') || c.closed_reason === 'no_show'));
  const showed = firstDayPeople.filter(c => {
    const o = out.get(c.id);
    return (o?.first_attendance_date && o.first_attendance_date <= addDays(c.first_day!, 3)) || atLeast(c.stage, 'started');
  }).length;

  const retention = [7, 30, 60].map(days => {
    const eligible = filtered.map(c => out.get(c.id)).filter((o): o is Outcome => !!o?.first_attendance_date
      && addDays(o.first_attendance_date, days) <= today && o.first_attendance_date >= addDays(f.from, -365));
    const retained = eligible.filter(o => (o.last_worked_date && daysBetween(o.first_attendance_date!, o.last_worked_date) >= days - 3)
      || (o.employee_status === 'active' && o.last_worked_date && daysBetween(o.last_worked_date, today) <= 7)).length;
    return { days, eligible: eligible.length, retained, rate: pct(retained, eligible.length) };
  });

  const filled = openings.filter(o => o.filled_on && inRange(o.filled_on, f.from, f.to));
  const avgDaysToFill = filled.length ? Math.round(filled.reduce((s, o) => s + daysBetween(o.opened_on, o.filled_on!), 0) / filled.length) : null;

  const open = tasks.filter(t => !t.done_at && (!t.candidate_id || ids.has(t.candidate_id)));
  return {
    total: filtered.length,
    newToday: filtered.filter(c => c.registered_at.slice(0, 10) === today).length,
    registered: cohort.length,
    contacted: reached('contacted'),
    interested: reached('interested'),
    preselected: reached('prescreened'),
    interviewsScheduled: filtered.filter(c => inRange(c.interview_at, f.from, f.to)).length,
    upcomingInterviews: filtered.filter(c => c.interview_at && c.interview_at.slice(0, 10) >= today).length,
    completed: reached('approved'),
    authorized: filtered.filter(c => ['approved', 'available', 'assigned', 'first_day_confirmed'].includes(c.stage)).length,
    confirmedStarts: reached('first_day_confirmed'),
    firstDayDue: firstDayPeople.length, firstDayShowed: showed, showRate: pct(showed, firstDayPeople.length),
    retention, avgDaysToFill, filledOpenings: filled.length,
    contactsToday: new Set(contacts.filter(e => e.created_at.slice(0, 10) === today && ids.has(e.candidate_id)).map(e => e.candidate_id)).size,
    overdueTasks: open.filter(t => t.due_on < today).length,
    dueToday: open.filter(t => t.due_on === today).length,
    stale: filtered.filter(c => c.stage !== 'closed' && !atLeast(c.stage, 'started')
      && daysBetween((c.last_contact_at ?? c.registered_at).slice(0, 10), today) >= staleDays).length,
  };
}

export interface SourceRow { id: string | null; name: string; registered: number; contacted: number; preselected: number; authorized: number; started: number; conversion: number | null; spend: number | null; costPerCandidate: number | null; costPerStart: number | null }

// Channel performance for candidates registered in the period. Cost only where a real monthly
// spend was entered for the source; otherwise it stays blank instead of guessing.
export function bySource(cohortAll: Candidate[], stageEvents: StageEvent[], sources: Source[], f: Filters): SourceRow[] {
  const cohort = cohortAll.filter(c => inRange(c.registered_at, f.from, f.to));
  const far = furthest(cohort, stageEvents);
  const months = Math.max(1, (daysBetween(f.from, f.to) + 1) / 30.4);
  const groups = new Map<string | null, Candidate[]>();
  cohort.forEach(c => { const k = c.source_id; groups.set(k, [...(groups.get(k) ?? []), c]); });
  const rows: SourceRow[] = [...groups.entries()].map(([id, cs]) => {
    const src = sources.find(s => s.id === id);
    const reached = (min: Stage) => cs.filter(c => { const s = far.get(c.id); return !!s && STAGE_INDEX[s] >= STAGE_INDEX[min]; }).length;
    const started = reached('started');
    const spend = src?.monthly_cost != null ? Math.round(src.monthly_cost * months * 100) / 100 : null;
    return {
      id, name: src?.name ?? '—', registered: cs.length, contacted: reached('contacted'), preselected: reached('prescreened'),
      authorized: reached('approved'), started, conversion: pct(started, cs.length), spend,
      costPerCandidate: spend != null ? Math.round((spend / cs.length) * 100) / 100 : null,
      costPerStart: spend != null && started ? Math.round((spend / started) * 100) / 100 : null,
    };
  });
  return rows.sort((a, b) => b.registered - a.registered);
}

export interface PoolAlert { opening: Opening; pool: number; needed: number }
export function lowPool(all: Candidate[], openings: Opening[], threshold: number): PoolAlert[] {
  return openings.filter(o => o.status === 'authorized').map(o => {
    const placed = all.filter(c => c.opening_id === o.id && atLeast(c.stage, 'assigned')).length;
    return { opening: o, pool: all.filter(c => inPool(c, o)).length, needed: Math.max(0, o.headcount - placed) };
  }).filter(a => a.needed > 0 && a.pool < Math.max(threshold, a.needed));
}
