// Runs the same Edge Function handler as Supabase (sync-homework) in Node, so the local stack
// and the e2e test exercise the real code. Development and tests only.
import http from 'node:http';
import { createClient } from '@supabase/supabase-js';
import { idukayApiSource } from '../../supabase/functions/_shared/sources/idukay-api.ts';
import { handleSync } from '../../supabase/functions/sync-homework/handler.ts';

const URL_ = process.env.SUPABASE_URL!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ANON = process.env.SUPABASE_ANON_KEY!;
const db = createClient(URL_, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });

http.createServer(async (req, res) => {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const request = new Request(`http://localhost${req.url}`, {
    method: req.method, headers: req.headers as Record<string, string>,
    body: req.method === 'GET' || req.method === 'HEAD' ? undefined : Buffer.concat(chunks),
  });
  const response = req.url?.startsWith('/sync-homework')
    ? await handleSync(request, {
        db, source: idukayApiSource(k => process.env[k]),
        async isAllowed(r) {
          const jwt = (r.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
          if (!jwt) return false;
          if (jwt === SERVICE) return true;
          const asUser = createClient(URL_, ANON, { global: { headers: { Authorization: `Bearer ${jwt}` } }, auth: { persistSession: false } });
          const { data } = await asUser.rpc('am_i_admin');
          return data === true;
        },
      })
    : new Response('not found', { status: 404 });
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(Buffer.from(await response.arrayBuffer()));
}).listen(Number(process.env.PORT || 54330), '127.0.0.1', () => console.log('functions up'));
