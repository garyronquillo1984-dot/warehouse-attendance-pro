import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { CANDIDATE_COLUMNS, type Candidate, type Task } from '../../lib/recruiting';
import type { ReportTable } from '../../lib/reports';
import { exportCsv, exportPdf, exportXlsx, type ExportContext } from '../../lib/export';

export function useCandidates(orgId: string) {
  const [list, setList] = useState<Candidate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    const { data, error: err } = await supabase.from('candidates').select(CANDIDATE_COLUMNS)
      .eq('organization_id', orgId).order('registered_at', { ascending: false }).limit(10000);
    setError(err ? err.message : null);
    setList((data ?? []) as unknown as Candidate[]);
  }, [orgId]);
  useEffect(() => { reload(); }, [reload]);
  return { list, error, reload };
}

export function useOpenTasks(orgId: string) {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const reload = useCallback(async () => {
    const { data } = await supabase.from('recruitment_tasks').select('id, candidate_id, kind, title, due_on, assigned_to, auto_key, done_at, created_at')
      .eq('organization_id', orgId).is('done_at', null).order('due_on').limit(5000);
    setTasks((data ?? []) as Task[]);
  }, [orgId]);
  useEffect(() => { reload(); }, [reload]);
  return { tasks, reload };
}

// Candidate data leaves the app only through here, and every export is logged.
export async function exportTable(orgId: string, kind: 'csv' | 'xlsx' | 'pdf', table: Omit<ReportTable, 'key'>, ctx: ExportContext) {
  const t = { ...table, key: 'summary' } as ReportTable;
  const { error } = await supabase.rpc('record_export', { org: orgId, what: table.title.slice(0, 60), row_count: table.rows.length });
  if (error) throw error;   // not allowed to export, or the log could not be written: no file
  if (kind === 'csv') exportCsv(t, ctx);
  else if (kind === 'xlsx') await exportXlsx(t, ctx);
  else await exportPdf(t, ctx);
}
