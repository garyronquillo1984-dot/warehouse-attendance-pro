// Supabase Edge Function "sync-homework". Schedule it hourly (see README) and/or call it from
// the admin console ("Sync now"). Never fakes data: without an authorized source it records
// 'not_configured'.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { idukayApiSource } from '../_shared/sources/idukay-api.ts';
import { handleSync } from './handler.ts';

const URL_ = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
const db = createClient(URL_, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });

Deno.serve(req => handleSync(req, {
  db,
  source: idukayApiSource(k => Deno.env.get(k)),
  async isAllowed(r) {
    const jwt = (r.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
    if (!jwt) return false;
    if (jwt === SERVICE) return true;                               // the scheduler
    const asUser = createClient(URL_, ANON, { global: { headers: { Authorization: `Bearer ${jwt}` } }, auth: { persistSession: false } });
    const { data } = await asUser.rpc('am_i_admin');                // a signed-in admin
    return data === true;
  },
}));
