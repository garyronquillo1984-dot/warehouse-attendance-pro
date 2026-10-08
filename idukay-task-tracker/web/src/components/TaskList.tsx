import { useCallback } from 'react';
import { useFamily } from '../lib/family';
import { useT } from '../lib/i18n';
import { todayIso } from '../lib/dates';
import type { Task, TaskStatus } from '../lib/types';
import { TaskRow } from './TaskRow';
import { useOpenTask } from './TaskSheet';
import { useToast } from './ui';

export function TaskList({ tasks, showChild }: { tasks: Task[]; showChild?: boolean }) {
  const fam = useFamily();
  const { t } = useT();
  const toast = useToast();
  const open = useOpenTask();
  const today = todayIso();
  const many = showChild ?? (fam.selected === 'all' && fam.activeChildren.length > 1);
  const onToggle = useCallback(async (id: string, next: TaskStatus) => {
    if (!(await fam.setStatus(id, next))) toast(t.common.error, 'error');
  }, [fam, toast, t]);
  return (
    <div className="task-list">
      {tasks.map(task => (
        <TaskRow key={task.id} task={task} child={fam.childById.get(task.child_id)} today={today} showChild={many} onToggle={onToggle} onOpen={open} />
      ))}
    </div>
  );
}
