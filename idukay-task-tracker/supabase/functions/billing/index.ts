// Supabase Edge Function "billing" (JWT verification ON). See handler.ts.
// Secrets: HOTMART_* (see _shared/payments/hotmart.ts) and APP_ORIGIN (your site's URL).
import { createClient } from 'npm:@supabase/supabase-js@2';
import { createHotmartProvider, hotmartConfigFromEnv } from '../_shared/payments/hotmart.ts';
import { handleBilling } from './handler.ts';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const provider = createHotmartProvider(hotmartConfigFromEnv(k => Deno.env.get(k)), admin);

Deno.serve(req => handleBilling(req, {
  provider,
  allowedOrigin: Deno.env.get('APP_ORIGIN') || '*',
  async userIdFromRequest(r) {
    const jwt = (r.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
    if (!jwt) return null;
    const { data, error } = await admin.auth.getUser(jwt);
    return error || !data.user ? null : data.user.id;
  },
}));
