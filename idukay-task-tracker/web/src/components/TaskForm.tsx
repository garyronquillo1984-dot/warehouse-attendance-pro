import { useState, type FormEvent } from 'react';
import { useT } from '../lib/i18n';
import { useFamily } from '../lib/family';
import { addDays, todayIso } from '../lib/dates';
import type { Task, TaskInput, TaskPriority } from '../lib/types';
import { Field } from './ui';

// Manual entry and editing. Only the subject, the task and the child are required.
export function TaskForm({ task, onSaved, onCancel, defaultChildId }: {
  task?: Task; onSaved: (t: Task) => void; onCancel?: () => void; defaultChildId?: string | null;
}) {
  const { t } = useT();
  const fam = useFamily();
  const firstChild = defaultChildId ?? (fam.selected !== 'all' ? fam.selected : fam.activeChildren[0]?.id ?? '');
  const [childId, setChildId] = useState(task?.child_id ?? firstChild);
  const [subject, setSubject] = useState(task?.subject ?? '');
  const [title, setTitle] = useState(task?.title ?? '');
  const [description, setDescription] = useState(task?.description ?? '');
  const [dueDate, setDueDate] = useState(task ? task.due_date ?? '' : addDays(todayIso(), 1));
  const [priority, setPriority] = useState<TaskPriority>(task?.priority ?? 'normal');
  const [minutes, setMinutes] = useState(task?.estimated_minutes ? String(task.estimated_minutes) : '');
  const [teacher, setTeacher] = useState(task?.teacher ?? '');
  const [notes, setNotes] = useState(task?.notes ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!childId) { setErr(t.task.chooseChild); return; }
    setBusy(true); setErr(null);
    const n = parseInt(minutes, 10);
    const input: TaskInput = {
      child_id: childId, subject: subject.trim(), title: title.trim(),
      description: description.trim() || null, due_date: dueDate || null, priority,
      estimated_minutes: Number.isFinite(n) && n > 0 ? Math.min(n, 600) : null,
      teacher: teacher.trim() || null, notes: notes.trim() || null,
      ...(task ? {} : { source: 'manual' as const }),
    };
    const saved = await fam.saveTask(task?.id ?? null, input);
    setBusy(false);
    if (saved) onSaved(saved); else setErr(t.common.error);
  };

  return (
    <form className="stack" onSubmit={submit}>
      {err && <div className="form-error" role="alert">{err}</div>}
      <Field label={t.task.child}>
        <select value={childId} onChange={e => setChildId(e.target.value)} required>
          <option value="" disabled>{t.task.chooseChild}</option>
          {fam.children.filter(c => c.is_active || c.id === childId).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </Field>
      <div className="grid-2">
        <Field label={t.task.subject}>
          <input value={subject} onChange={e => setSubject(e.target.value)} list="subject-list" required maxLength={80} autoComplete="off" />
        </Field>
        <Field label={t.task.dueDate} optional>
          <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
        </Field>
      </div>
      <datalist id="subject-list">{fam.subjects.map(s => <option key={s} value={s} />)}</datalist>
      <Field label={t.task.title}>
        <input value={title} onChange={e => setTitle(e.target.value)} required maxLength={200} />
      </Field>
      <Field label={t.task.description} optional>
        <textarea value={description} onChange={e => setDescription(e.target.value)} maxLength={4000} />
      </Field>
      <div className="grid-2">
        <Field label={t.task.priority}>
          <select value={priority} onChange={e => setPriority(e.target.value as TaskPriority)}>
            {(['low', 'normal', 'high'] as const).map(p => <option key={p} value={p}>{t.priority[p]}</option>)}
          </select>
        </Field>
        <Field label={t.task.estimated} optional>
          <input type="number" inputMode="numeric" min={1} max={600} value={minutes} onChange={e => setMinutes(e.target.value)} />
        </Field>
      </div>
      <Field label={t.task.teacher} optional>
        <input value={teacher} onChange={e => setTeacher(e.target.value)} maxLength={120} />
      </Field>
      <Field label={t.task.notes} optional>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} maxLength={2000} style={{ minHeight: 70 }} />
      </Field>
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        {onCancel && <button type="button" className="btn secondary" onClick={onCancel}>{t.common.cancel}</button>}
        <button className="btn" disabled={busy}>{busy ? t.common.saving : t.common.save}</button>
      </div>
    </form>
  );
}
