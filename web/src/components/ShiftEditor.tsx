import { WEEKDAYS, formatTime, shiftLength } from '../lib/time';
import type { Shift } from '../lib/types';

interface Props {
  shift: Shift;
  index: number;
  onChange: (s: Shift) => void;
  onRemove?: () => void;
  idPrefix?: string;
}

export function ShiftEditor({ shift, index, onChange, onRemove, idPrefix = 'shift' }: Props) {
  const set = <K extends keyof Shift>(k: K, v: Shift[K]) => onChange({ ...shift, [k]: v });
  const toggleDay = (n: number) =>
    set('days', shift.days.includes(n) ? shift.days.filter(d => d !== n) : [...shift.days, n].sort());
  const len = shift.start_time && shift.end_time ? shiftLength(shift.start_time, shift.end_time) : null;
  const p = `${idPrefix}-${index}`;

  return (
    <fieldset className="shift" aria-label={shift.name || `Shift ${index + 1}`} style={{ margin: 0 }}>
      <div className="shift-grid">
        <div className="field">
          <label htmlFor={`${p}-name`}>Shift name</label>
          <input id={`${p}-name`} type="text" value={shift.name} maxLength={60} required
                 onChange={e => set('name', e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor={`${p}-start`}>Starts</label>
          <input id={`${p}-start`} type="time" value={shift.start_time} required
                 onChange={e => set('start_time', e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor={`${p}-end`}>Ends</label>
          <input id={`${p}-end`} type="time" value={shift.end_time} required
                 onChange={e => set('end_time', e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor={`${p}-grace`}>Late after</label>
          <select id={`${p}-grace`} value={shift.late_grace_minutes}
                  onChange={e => set('late_grace_minutes', Number(e.target.value))}>
            {[0, 3, 5, 7, 10, 15].map(m => <option key={m} value={m}>{m} min</option>)}
          </select>
        </div>
      </div>

      <div className="field">
        <span id={`${p}-days`} style={{ fontWeight: 600, fontSize: '0.95rem' }}>Work days</span>
        <div className="days" role="group" aria-labelledby={`${p}-days`}>
          {WEEKDAYS.map(d => (
            <button key={d.n} type="button" className="day" aria-pressed={shift.days.includes(d.n)}
                    onClick={() => toggleDay(d.n)}>{d.short}</button>
          ))}
        </div>
      </div>

      <div className="shift-meta">
        <span className="muted small">
          {len ? `${formatTime(shift.start_time)} – ${formatTime(shift.end_time)} · ${len.label}` : 'Set start and end times'}
          {len?.overnight ? ' · ends the next day; attendance counts on the start date' : ''}
        </span>
        <div className="row">
          <label className="row small" style={{ gap: 8 }}>
            <input type="checkbox" checked={shift.is_active} onChange={e => set('is_active', e.target.checked)}
                   style={{ width: 20, height: 20 }} />
            Active
          </label>
          {onRemove && <button type="button" className="btn btn-ghost" onClick={onRemove}>Remove</button>}
        </div>
      </div>
    </fieldset>
  );
}

export const DEFAULT_SHIFTS: Shift[] = [
  { name: 'First Shift', start_time: '06:00', end_time: '15:45', days: [1, 2, 3, 4, 5], late_grace_minutes: 5, is_active: true },
  { name: 'Second Shift', start_time: '16:00', end_time: '00:30', days: [1, 2, 3, 4, 5], late_grace_minutes: 5, is_active: true },
];

export function validateShifts(shifts: Shift[]): string | null {
  if (!shifts.length) return 'Add at least one shift.';
  for (const s of shifts) {
    if (!s.name.trim()) return 'Every shift needs a name.';
    if (!s.start_time || !s.end_time) return `Set start and end times for ${s.name}.`;
    if (s.start_time === s.end_time) return `${s.name} starts and ends at the same time.`;
    if (!s.days.length) return `Pick at least one work day for ${s.name}.`;
  }
  const names = shifts.map(s => s.name.trim().toLowerCase());
  if (new Set(names).size !== names.length) return 'Two shifts have the same name.';
  return null;
}
