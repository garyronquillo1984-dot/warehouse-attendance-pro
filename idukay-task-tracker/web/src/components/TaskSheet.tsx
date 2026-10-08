import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { useT } from '../lib/i18n';
import { useFamily } from '../lib/family';
import { fmtDateTime, fmtLong, isOverdue, todayIso } from '../lib/dates';
import type { StatusChange, TaskStatus } from '../lib/types';
import { Sheet, useToast } from './ui';
import { TaskForm } from './TaskForm';

// Any page can open a task's details: const openTask = useOpenTask(); openTask(id)
const Ctx = createContext<(id: string) => void>(() => {});
export const useOpenTask = () => useContext(Ctx);

export function TaskSheetProvider({ children }: { children: ReactNode }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const close = useCallback(() => setOpenId(null), []);
  return (
    <Ctx.Provider value={setOpenId}>
      {children}
      {openId && <TaskDetails id={openId} onClose={close} />}
    </Ctx.Provider>
  );
}

function TaskDetails({ id, onClose }: { id: string; onClose: () => void }) {
  const { t } = useT();
  const fam = useFamily();
  const toast = useToast();
  const task = fam.tasks.find(x => x.id === id);
  const [editing, setEditing] = useState(false);
  const [history, setHistory] = useState<StatusChange[]>([]);
  const status = task?.status;

  useEffect(() => {
    let live = true;
    supabase.from('task_status_history').select('id, from_status, to_status, changed_at').eq('task_id', id).order('changed_at', { ascending: false }).limit(30)
      .then(({ data }) => { if (live && data) setHistory(data as StatusChange[]); });
    return () => { live = false; };
  }, [id, status]);

  if (!task) return null;
  const child = fam.childById.get(task.child_id);
  const today = todayIso();
  const setStatus = async (s: TaskStatus) => { if (!(await fam.setStatus(task.id, s))) toast(t.common.error, 'error'); };
  const remove = async () => {
    if (!confirm(t.task.deleteConfirm)) return;
    if (await fam.deleteTask(task.id)) { toast(t.task.deleted); onClose(); } else toast(t.common.error, 'error');
  };
  const statusLabel = isOverdue(task, today) ? t.status.overdue : t.status[task.status];

  return (
    <Sheet open onClose={onClose} labelledBy="task-title" title={
      <div className="stack-sm">
        <div className="row-wrap">
          {child && <span className="pill neutral"><i className="kid-dot" style={{ background: child.color }} /> {child.name}</span>}
          <span className="pill neutral">{task.subject}</span>
          {task.source === 'sample' && <span className="pill neutral">{t.common.sample}</span>}
        </div>
        <h2 id="task-title">{task.title}</h2>
      </div>
    }>
      {editing ? (
        <TaskForm task={task} onCancel={() => setEditing(false)} onSaved={() => { setEditing(false); toast(t.task.saved); }} />
      ) : (
        <div className="stack">
          <div className="status-seg" role="group" aria-label={t.task.status}>
            {(['pending', 'in_progress', 'completed'] as const).map(s => (
              <button type="button" key={s} className={task.status === s ? 'on' : ''} aria-pressed={task.status === s} onClick={() => setStatus(s)}>
                {t.status[s]}
              </button>
            ))}
          </div>
          <dl className="kv">
            <dt>{t.task.status}</dt><dd>{statusLabel}</dd>
            <dt>{t.task.dueDate}</dt><dd>{task.due_date ? fmtLong(task.due_date, t.locale) : t.task.noDate}</dd>
            <dt>{t.task.priority}</dt><dd>{t.priority[task.priority]}</dd>
            {task.estimated_minutes ? <><dt>{t.task.estimated}</dt><dd>{t.common.minutes(task.estimated_minutes)}</dd></> : null}
            {task.teacher && <><dt>{t.task.teacher}</dt><dd>{task.teacher}</dd></>}
            <dt>{t.task.source}</dt><dd>{t.source[task.source]}</dd>
          </dl>
          {task.description && <div className="desc">{task.description}</div>}
          {task.notes && <div className="desc" style={{ background: 'var(--yellow-soft)' }}>📝 {task.notes}</div>}
          {history.length > 0 && (
            <div className="stack-sm">
              <div className="eyebrow">{t.task.history}</div>
              <ul className="timeline" style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                {history.map(h => (
                  <li key={h.id}><span className="when">{fmtDateTime(h.changed_at, t.locale)}</span>
                    <span>{t.task.historyItem(h.from_status ? t.status[h.from_status] : null, t.status[h.to_status])}</span></li>
                ))}
              </ul>
            </div>
          )}
          <div className="spread">
            <button type="button" className="btn ghost small" style={{ color: 'var(--red)' }} onClick={remove}>{t.common.delete}</button>
            <button type="button" className="btn secondary" onClick={() => setEditing(true)}>{t.task.edit}</button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
