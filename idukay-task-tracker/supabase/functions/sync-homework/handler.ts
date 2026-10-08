// Runs one synchronization pass for every active class:
//   source → new homework added, modified homework updated (previous version kept),
//   unchanged skipped; the result is recorded in sync_runs for the admin console.
// Allowed callers: the scheduler (service role) or a signed-in admin ("Sync now").
import type { Db, HomeworkSource, ClassRef } from '../_shared/sources/source.ts';

export interface SyncDeps {
  db: Db;                                            // service-role client
  source: HomeworkSource;
  isAllowed(req: Request): Promise<boolean>;
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });

export async function handleSync(req: Request, deps: SyncDeps): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: {
    'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' } });
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  if (!(await deps.isAllowed(req))) return json(403, { error: 'forbidden' });

  const { data, error } = await deps.db.rpc('svc_sync_classes');
  if (error) return json(500, { error: 'classes_unavailable' });
  const results: Array<Record<string, unknown>> = [];
  for (const cls of (data as ClassRef[]) ?? []) {
    try {
      const r = await deps.source.fetchHomework(cls);
      if (r.status === 'not_configured') {
        await deps.db.rpc('svc_sync_record', { p_class: cls.id, p_source: deps.source.id, p_status: 'not_configured', p_message: r.message });
        results.push({ class: cls.id, status: 'not_configured', message: r.message });
        continue;
      }
      const bad = r.items.filter(i => !i.external_id || !i.subject || !i.title || !/^\d{4}-\d{2}-\d{2}$/.test(i.start_date) || !/^\d{4}-\d{2}-\d{2}$/.test(i.due_date));
      if (bad.length) throw new Error(`${bad.length} item(s) missing external_id, subject, title or dates`);
      const applied = await deps.db.rpc('svc_sync_apply', { p_class: cls.id, p_source: deps.source.id, p_items: r.items });
      if (applied.error) throw new Error(applied.error.message);
      results.push({ class: cls.id, status: 'ok', ...(applied.data as object) });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await deps.db.rpc('svc_sync_record', { p_class: cls.id, p_source: deps.source.id, p_status: 'error', p_message: message });
      results.push({ class: cls.id, status: 'error', message });
    }
  }
  return json(200, { ok: true, results });
}
