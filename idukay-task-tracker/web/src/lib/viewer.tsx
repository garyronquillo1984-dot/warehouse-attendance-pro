// The parent's read-only view. The private link token lives on this device only and is sent to
// the database's viewer_* functions, which return exactly what that link may see.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { supabase } from './supabase';
import { addDays } from './dates';
import { HISTORY_DAYS } from './config';
import type { Homework, ViewerOpen, ViewerStudent } from './types';

const TOKEN_KEY = 'itt.link';
const STUDENT_KEY = 'itt.student';
const get = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const set = (k: string, v: string | null) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* blocked */ } };

export const savedToken = () => get(TOKEN_KEY);
export const saveToken = (t: string) => set(TOKEN_KEY, t);
export const forgetToken = () => { set(TOKEN_KEY, null); set(STUDENT_KEY, null); };

export async function openLink(token: string): Promise<ViewerOpen | null> {
  const { data, error } = await supabase.rpc('viewer_open', { p_token: token });
  if (error) throw new Error(error.message);
  return (data as ViewerOpen | null) ?? null;
}

interface ViewerState {
  token: string;
  status: 'loading' | 'ready' | 'invalid' | 'error';
  data: ViewerOpen | null;
  student: ViewerStudent | null;
  selectStudent: (id: string) => void;
  today: string;
  homework: Homework[];          // the selected student's class, today −14 … today +14
  refresh: () => Promise<void>;
  fetchDetail: (id: string) => Promise<Homework | null>;
  fetchArchiveMonths: () => Promise<Array<{ month: string; count: number }>>;
  fetchArchive: (month: string, subject?: string | null, query?: string | null) => Promise<Homework[]>;
}

const Ctx = createContext<ViewerState | null>(null);

export function ViewerProvider({ token, children }: { token: string; children: ReactNode }) {
  const [status, setStatus] = useState<ViewerState['status']>('loading');
  const [data, setData] = useState<ViewerOpen | null>(null);
  const [studentId, setStudentId] = useState<string | null>(get(STUDENT_KEY));
  const [homework, setHomework] = useState<Homework[]>([]);

  const student = data?.students.find(s => s.id === studentId) ?? data?.students[0] ?? null;
  const today = student?.today ?? new Date().toISOString().slice(0, 10);

  const load = useCallback(async () => {
    try {
      const d = await openLink(token);
      if (!d || d.students.length === 0) { setStatus('invalid'); return; }
      setData(d);
      const s = d.students.find(x => x.id === (get(STUDENT_KEY) ?? '')) ?? d.students[0];
      const { data: hw, error } = await supabase.rpc('viewer_homework', {
        p_token: token, p_student: s.id, p_from: addDays(s.today, -HISTORY_DAYS), p_to: addDays(s.today, HISTORY_DAYS),
      });
      if (error) throw error;
      setHomework((hw as Homework[] | null) ?? []);
      setStatus('ready');
    } catch {
      setStatus(prev => (prev === 'ready' ? 'ready' : 'error'));   // keep showing what we have if a refresh fails
    }
  }, [token]);

  useEffect(() => { void load(); }, [load, studentId]);
  // Stay current: refresh every 15 minutes and whenever the parent comes back to the app.
  useEffect(() => {
    const id = setInterval(() => void load(), 15 * 60_000);
    const onVisible = () => { if (document.visibilityState === 'visible') void load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVisible); };
  }, [load]);

  const value = useMemo<ViewerState>(() => ({
    token, status, data, student, today, homework,
    selectStudent: (id: string) => { set(STUDENT_KEY, id); setStudentId(id); },
    refresh: load,
    async fetchDetail(id) {
      if (!student) return null;
      const { data: d } = await supabase.rpc('viewer_homework_detail', { p_token: token, p_student: student.id, p_id: id });
      return (d as Homework | null) ?? null;
    },
    async fetchArchiveMonths() {
      if (!student) return [];
      const { data: d } = await supabase.rpc('viewer_archive_months', { p_token: token, p_student: student.id });
      return (d as Array<{ month: string; count: number }> | null) ?? [];
    },
    async fetchArchive(month, subject = null, query = null) {
      if (!student) return [];
      const { data: d } = await supabase.rpc('viewer_archive', { p_token: token, p_student: student.id, p_month: month, p_subject: subject, p_query: query });
      return (d as Homework[] | null) ?? [];
    },
  }), [token, status, data, student, today, homework, load]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useViewer() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useViewer outside ViewerProvider');
  return v;
}
