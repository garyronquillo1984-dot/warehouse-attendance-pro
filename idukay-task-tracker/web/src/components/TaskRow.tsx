import { memo } from 'react';
import { useT } from '../lib/i18n';
import { fmtDate, urgencyOf } from '../lib/dates';
import type { Child, Task, TaskStatus } from '../lib/types';
import { IconCheck } from './Icons';

// One task. The tick toggles pending ⇄ completed in place; tapping the text opens details.
// Buttons are type="button" and nothing here navigates, so the page never scrolls or jumps.
export const TaskRow = memo(function TaskRow({ task, child, today, showChild, onToggle, onOpen }: {
  task: Task; child?: Child; today: string; showChild: boolean;
  onToggle: (id: string, next: TaskStatus) => void; onOpen: (id: string) => void;
}) {
  const { t } = useT();
  const done = task.status === 'completed';
  const u = urgencyOf(task, today);
  return (
    <div className={`task-row${done ? ' is-done' : ''}`} data-task-id={task.id}>
      <button
        type="button"
        className={`tick${done ? ' on' : task.status === 'in_progress' ? ' progress' : ''}`}
        aria-pressed={done}
        aria-label={`${done ? t.task.markPending : t.task.markDone}: ${task.title}`}
        onClick={() => onToggle(task.id, done ? 'pending' : 'completed')}
      >
        <span className="box">{done && <IconCheck />}</span>
      </button>
      <button type="button" className="task-main" onClick={() => onOpen(task.id)}>
        <div className="task-title">{task.title}</div>
        <div className="task-meta">
          {showChild && child && <span className="row" style={{ gap: 5 }}><i className="kid-dot" style={{ background: child.color }} />{child.name}</span>}
          <span>{task.subject}</span>
          {task.due_date && <span>· {fmtDate(task.due_date, t.locale)}</span>}
          {task.estimated_minutes ? <span>· {t.common.minutes(task.estimated_minutes)}</span> : null}
          {!done && (u === 'overdue' || u === 'today' || u === 'soon') && <span className={`pill ${u}`}>{t.urgency[u]}</span>}
          {!done && task.status === 'in_progress' && <span className="pill scheduled">{t.status.in_progress}</span>}
          {!done && task.priority === 'high' && <span className="pill high">!</span>}
        </div>
      </button>
    </div>
  );
});
