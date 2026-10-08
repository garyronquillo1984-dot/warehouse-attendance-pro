// Runs the same Edge Function handlers as Supabase (billing, hotmart-webhook) in Node, so the
// local stack and the e2e test exercise the real code. Development and tests only.
import http from 'node:http';
import { createClient } from '@supabase/supabase-js';
import { createHotmartProvider, hotmartConfigFromEnv } from '../../supabase/functions/_shared/payments/hotmart.ts';
import { handleBilling } from '../../supabase/functions/billing/handler.ts';

const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const provider = createHotmartProvider(hotmartConfigFromEnv(k => process.env[k]), admin);

http.createServer(async (req, res) => {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;
  const request = new Request(`http://localhost${req.url}`, {
    method: req.method, headers: req.headers as Record<string, string>,
    body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body,
  });
  let response: Response;
  if (req.url?.startsWith('/billing')) {
    response = await handleBilling(request, {
      provider, allowedOrigin: '*',
      async userIdFromRequest(r) {
        const jwt = (r.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
        if (!jwt) return null;
        const { data, error } = await admin.auth.getUser(jwt);
        return error || !data.user ? null : data.user.id;
      },
    });
  } else if (req.url?.startsWith('/hotmart-webhook')) {
    response = await provider.processWebhook(request);
  } else {
    response = new Response('not found', { status: 404 });
  }
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(Buffer.from(await response.arrayBuffer()));
}).listen(Number(process.env.PORT || 54330), '127.0.0.1', () => console.log('functions up'));
