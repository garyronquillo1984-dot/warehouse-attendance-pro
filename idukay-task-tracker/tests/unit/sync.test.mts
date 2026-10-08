import { test, eq } from './harness.mts';
import { handleSync } from '../../supabase/functions/sync-homework/handler.ts';
import { idukayApiSource } from '../../supabase/functions/_shared/sources/idukay-api.ts';
import type { HomeworkSource } from '../../supabase/functions/_shared/sources/source.ts';

function fakeDb() {
  const calls: Array<{ fn: string; args?: Record<string, unknown> }> = [];
  return {
    calls,
    async rpc(fn: string, args?: Record<string, unknown>) {
      calls.push({ fn, args });
      if (fn === 'svc_sync_classes') return { data: [{ id: 'c1', grade_label: '4.º', parallel: 'A', school_year: null }], error: null };
      if (fn === 'svc_sync_apply') return { data: { added: 1, updated: 0, unchanged: 0 }, error: null };
      return { data: null, error: null };
    },
  };
}
const post = () => new Request('http://x/sync-homework', { method: 'POST' });
const allow = async () => true;

test('sync: refuses callers who are not the scheduler or an admin', async () => {
  const db = fakeDb();
  const res = await handleSync(post(), { db, source: idukayApiSource(() => undefined), isAllowed: async () => false });
  eq(res.status, 403); eq(db.calls.length, 0);
});
test('sync: without an authorized Idukay integration it records not_configured (no fake data)', async () => {
  const db = fakeDb();
  const res = await handleSync(post(), { db, source: idukayApiSource(() => undefined), isAllowed: allow });
  const body = await res.json();
  eq(body.results[0].status, 'not_configured');
  eq(db.calls.map(c => c.fn), ['svc_sync_classes', 'svc_sync_record']);
  eq(db.calls[1].args?.p_status, 'not_configured');
});
test('sync: credentials alone do not make the placeholder pretend to work', async () => {
  const env: Record<string, string> = { IDUKAY_API_URL: 'https://example', IDUKAY_API_TOKEN: 't', IDUKAY_CLASS_MAP: '{"c1":"4A"}' };
  const r = await idukayApiSource(k => env[k]).fetchHomework({ id: 'c1', grade_label: '4.º', parallel: 'A', school_year: null });
  eq(r.status, 'not_configured');
});
test('sync: an authorized source\'s items are upserted', async () => {
  const db = fakeDb();
  const source: HomeworkSource = { id: 'test', async fetchHomework() {
    return { status: 'ok', items: [{ external_id: 'a1', subject: 'Science', title: 'Water cycle', start_date: '2026-10-08', due_date: '2026-10-10' }] };
  } };
  const body = await (await handleSync(post(), { db, source, isAllowed: allow })).json();
  eq(body.results[0], { class: 'c1', status: 'ok', added: 1, updated: 0, unchanged: 0 });
  eq((db.calls[1].args?.p_items as unknown[]).length, 1);
});
test('sync: malformed items are rejected and recorded as an error', async () => {
  const db = fakeDb();
  const source: HomeworkSource = { id: 'test', async fetchHomework() {
    return { status: 'ok', items: [{ external_id: '', subject: 'Science', title: 'x', start_date: 'tomorrow', due_date: '2026-10-10' }] };
  } };
  const body = await (await handleSync(post(), { db, source, isAllowed: allow })).json();
  eq(body.results[0].status, 'error');
  eq(db.calls.some(c => c.fn === 'svc_sync_apply'), false);
});
