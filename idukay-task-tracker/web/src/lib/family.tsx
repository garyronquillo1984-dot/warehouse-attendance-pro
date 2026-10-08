// The family's data in memory: children, schools and the working set of tasks
// (everything open, plus the last 60 days). Older completed tasks are paged in by the
// Completed page. Every query is filtered by the database to the signed-in parent.
//
// Ticking a task is optimistic and edits the task in place: lists keep their order and
// their rows, so the screen never jumps.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { supabase } from './supabase';
import { useAuth } from './auth';
import { addDays, todayIso } from './dates';
import type { Child, School, Task, TaskInput, TaskStatus } from './types';

const TASK_COLS = 'id, child_id, subject, subject_id, title, description, assigned_date, due_date, due_time, priority, status, estimated_minutes, teacher, notes, source, completed_at, created_at, updated_at';
const CHILD_COLS = 'id, name, grade, school_id, classroom, teacher, color, is_active, is_sample, sort_order, created_at';
const SELECTED_KEY = 'itt.child';

export type ChildInput = Partial<Pick<Child, 'name' | 'grade' | 'school_id' | 'classroom' | 'teacher' | 'color' | 'is_active' | 'sort_order'>>;

interface FamilyState {
  loading: boolean;
  error: string | null;
  children: Child[];               // all, including inactive
  activeChildren: Child[];
  schools: School[];
  tasks: Task[];
  subjects: string[];
  selected: string;                // 'all' or a child id
  setSelected: (id: string) => void;
  visibleTasks: Task[];            // tasks of the selected child (or all active children)
  childById: Map<string, Child>;
  reload: () => Promise<void>;
  setStatus: (id: string, status: TaskStatus) => Promise<boolean>;
  saveTask: (id: string | null, input: TaskInput) => Promise<Task | null>;
  createTasks: (rows: TaskInput[]) => Promise<number>;
  deleteTask: (id: string) => Promise<boolean>;
  saveChild: (id: string | null, input: ChildInput) => Promise<Child | null>;
  deleteChild: (id: string) => Promise<boolean>;
  ensureSchool: (name: string) => Promise<string | null>;
  lastError: string | null;
}

const Ctx = createContext<FamilyState | null>(null);

function readSelected(): string {
  try { return localStorage.getItem(SELECTED_KEY) || 'all'; } catch { return 'all'; }
}

export function FamilyProvider({ children: kids }: { children: ReactNode }) {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [children, setChildren] = useState<Child[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selected, setSelectedState] = useState<string>(readSelected);

  const setSelected = (id: string) => {
    setSelectedState(id);
    try { localStorage.setItem(SELECTED_KEY, id); } catch { /* storage blocked: preference only */ }
  };

  const reload = useCallback(async () => {
    if (!userId) return;
    const since = addDays(todayIso(), -60);
    const [c, s, t] = await Promise.all([
      supabase.from('children').select(CHILD_COLS).order('sort_order').order('created_at'),
      supabase.from('schools').select('id, name').order('name'),
      supabase.from('tasks').select(TASK_COLS)
        .or(`status.neq.completed,due_date.gte.${since},completed_at.gte.${since}`)
        .order('due_date', { ascending: true, nullsFirst: false }).limit(3000),
    ]);
    const err = c.error ?? s.error ?? t.error;
    if (err) { setError(err.message); setLoading(false); return; }
    setChildren(c.data as Child[]);
    setSchools(s.data as School[]);
    setTasks(t.data as Task[]);
    setError(null);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    if (!userId) { setChildren([]); setTasks([]); setSchools([]); setLoading(false); return; }
    setLoading(true);
    void reload();
  }, [userId, reload]);

  // A selected child that no longer exists falls back to "all".
  useEffect(() => {
    if (!loading && selected !== 'all' && !children.some(c => c.id === selected)) setSelected('all');
  }, [loading, children, selected]);

  const fail = (msg: string) => { setLastError(msg); return null; };

  const setStatus = async (id: string, status: TaskStatus) => {
    const before = tasks.find(t => t.id === id);
    if (!before) {
      // an older task paged in by the Completed page: update it and bring it into memory
      const { data, error: e } = await supabase.from('tasks').update({ status }).eq('id', id).select(TASK_COLS).single();
      if (e || !data) { fail(e?.message ?? 'update failed'); return false; }
      setTasks(ts => [...ts, data as Task]);
      return true;
    }
    if (before.status === status) return true;
    const completed_at = status === 'completed' ? new Date().toISOString() : null;
    setTasks(ts => ts.map(t => (t.id === id ? { ...t, status, completed_at } : t)));
    const { data, error: e } = await supabase.from('tasks').update({ status }).eq('id', id).select(TASK_COLS).single();
    if (e || !data) {
      setTasks(ts => ts.map(t => (t.id === id ? before : t)));
      fail(e?.message ?? 'update failed');
      return false;
    }
    setTasks(ts => ts.map(t => (t.id === id ? (data as Task) : t)));
    return true;
  };

  const saveTask = async (id: string | null, input: TaskInput) => {
    const q = id
      ? supabase.from('tasks').update(input).eq('id', id).select(TASK_COLS).single()
      : supabase.from('tasks').insert(input).select(TASK_COLS).single();
    const { data, error: e } = await q;
    if (e || !data) return fail(e?.message ?? 'save failed');
    const saved = data as Task;
    setTasks(ts => (id ? ts.map(t => (t.id === id ? saved : t)) : [...ts, saved]));
    return saved;
  };

  const createTasks = async (rows: TaskInput[]) => {
    if (!rows.length) return 0;
    const { data, error: e } = await supabase.from('tasks').insert(rows).select(TASK_COLS);
    if (e || !data) { fail(e?.message ?? 'save failed'); return 0; }
    setTasks(ts => [...ts, ...(data as Task[])]);
    return data.length;
  };

  const deleteTask = async (id: string) => {
    const { error: e } = await supabase.from('tasks').delete().eq('id', id);
    if (e) { fail(e.message); return false; }
    setTasks(ts => ts.filter(t => t.id !== id));
    return true;
  };

  const saveChild = async (id: string | null, input: ChildInput) => {
    const q = id
      ? supabase.from('children').update(input).eq('id', id).select(CHILD_COLS).single()
      : supabase.from('children').insert(input).select(CHILD_COLS).single();
    const { data, error: e } = await q;
    if (e || !data) return fail(e?.message ?? 'save failed');
    const saved = data as Child;
    setChildren(cs => (id ? cs.map(c => (c.id === id ? saved : c)) : [...cs, saved]));
    return saved;
  };

  const deleteChild = async (id: string) => {
    const { error: e } = await supabase.from('children').delete().eq('id', id);
    if (e) { fail(e.message); return false; }
    setChildren(cs => cs.filter(c => c.id !== id));
    setTasks(ts => ts.filter(t => t.child_id !== id));
    return true;
  };

  const ensureSchool = async (name: string) => {
    const clean = name.trim();
    if (!clean) return null;
    const found = schools.find(s => s.name.trim().toLowerCase() === clean.toLowerCase());
    if (found) return found.id;
    const { data, error: e } = await supabase.from('schools').insert({ name: clean }).select('id, name').single();
    if (e || !data) return fail(e?.message ?? 'save failed');
    setSchools(ss => [...ss, data as School]);
    return (data as School).id;
  };

  const value = useMemo<FamilyState>(() => {
    const activeChildren = children.filter(c => c.is_active);
    const childById = new Map(children.map(c => [c.id, c]));
    const activeIds = new Set(activeChildren.map(c => c.id));
    const visibleTasks = selected === 'all'
      ? tasks.filter(t => activeIds.has(t.child_id))
      : tasks.filter(t => t.child_id === selected);
    const subjects = [...new Set(tasks.map(t => t.subject))].sort((a, b) => a.localeCompare(b));
    return {
      loading, error, children, activeChildren, schools, tasks, subjects, selected, setSelected,
      visibleTasks, childById, reload, setStatus, saveTask, createTasks, deleteTask, saveChild,
      deleteChild, ensureSchool, lastError,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, error, children, schools, tasks, selected, reload, lastError]);

  return <Ctx.Provider value={value}>{kids}</Ctx.Provider>;
}

export function useFamily() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useFamily outside FamilyProvider');
  return v;
}
