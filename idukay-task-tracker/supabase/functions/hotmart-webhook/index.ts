// Supabase Edge Function "hotmart-webhook" (JWT verification OFF: Hotmart authenticates with
// its own token, X-HOTMART-HOTTOK = HOTMART_WEBHOOK_SECRET).
// URL for Hotmart → Tools → Webhook (version 2.0.0): https://<project>.supabase.co/functions/v1/hotmart-webhook
//
// Replies 200 when the event was applied, duplicated or ignored on purpose (so Hotmart stops
// resending), 401 for a wrong token, 500 when saving failed or not configured (Hotmart retries).
import { createClient } from 'npm:@supabase/supabase-js@2';
import { createHotmartProvider, hotmartConfigFromEnv } from '../_shared/payments/hotmart.ts';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const provider = createHotmartProvider(hotmartConfigFromEnv(k => Deno.env.get(k)), admin);

Deno.serve(req => provider.processWebhook(req));
