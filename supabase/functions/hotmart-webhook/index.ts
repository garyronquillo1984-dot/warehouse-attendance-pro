// Hotmart webhook (version 2.0.0) → license changes.
//
// Configure in Supabase → Edge Functions → Secrets:
//   HOTMART_HOTTOK        (required) the token from Hotmart → Tools → Webhook. Never commit it.
//   HOTMART_PRODUCT_IDS   (recommended) comma-separated Hotmart product ids for this app;
//                         events for your other products are acknowledged and ignored.
//   HOTMART_PLAN_MAP      (optional) JSON: offer code / plan name / plan id → our plan code.
//   HOTMART_DEFAULT_PLAN  (optional) plan when nothing matches. Default: professional.
//   HOTMART_ONE_TIME_MONTHS (optional) access bought by a one-time payment (no subscription),
//                         in months. Default 12. Use 1200 for "lifetime".
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase automatically.
//
// Replies: 200 when the event was applied, was a duplicate, or is ignored on purpose
// (so Hotmart stops resending); 401 for a wrong token; 500 when saving failed (Hotmart retries).
import { createClient } from 'npm:@supabase/supabase-js@2';
import { parseHotmart, planFor } from './parse.ts';

const HOTTOK = Deno.env.get('HOTMART_HOTTOK') ?? '';
const PRODUCT_IDS = (Deno.env.get('HOTMART_PRODUCT_IDS') ?? '').split(',').map(s => s.trim()).filter(Boolean);
const DEFAULT_PLAN = Deno.env.get('HOTMART_DEFAULT_PLAN') || 'professional';
const ONE_TIME_MONTHS = Math.max(1, Number(Deno.env.get('HOTMART_ONE_TIME_MONTHS') || 12) || 12);
let PLAN_MAP: Record<string, string> = {};
try { PLAN_MAP = JSON.parse(Deno.env.get('HOTMART_PLAN_MAP') || '{}'); } catch { console.error('HOTMART_PLAN_MAP is not valid JSON'); }

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

// Constant-time comparison (hash both sides so lengths match).
async function sameToken(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [x, y] = await Promise.all([crypto.subtle.digest('SHA-256', enc.encode(a)), crypto.subtle.digest('SHA-256', enc.encode(b))]);
  const ua = new Uint8Array(x), ub = new Uint8Array(y);
  let diff = 0;
  for (let i = 0; i < ua.length; i++) diff |= ua[i] ^ ub[i];
  return diff === 0;
}

// A one-time payment (no subscription, no next charge date) buys a fixed period of access.
function oneTimeEnd(ev: { eventType: string; subscriberCode: string | null; eventTime: string | null }): string | null {
  if (ev.subscriberCode || (ev.eventType !== 'PURCHASE_APPROVED' && ev.eventType !== 'PURCHASE_COMPLETE')) return null;
  const d = new Date(ev.eventTime ?? Date.now());
  d.setUTCMonth(d.getUTCMonth() + ONE_TIME_MONTHS);
  return d.toISOString();
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  if (!HOTTOK) return json(500, { error: 'not_configured' });         // fail closed until the secret is set

  const token = req.headers.get('x-hotmart-hottok') ?? '';
  if (!token || !(await sameToken(token, HOTTOK))) return json(401, { error: 'invalid_token' });

  const raw = await req.text();
  if (raw.length > 256_000) return json(413, { error: 'too_large' });
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return json(400, { error: 'invalid_json' }); }

  const ev = parseHotmart(body);
  if (!ev) return json(400, { error: 'not_a_hotmart_event' });

  if (PRODUCT_IDS.length && ev.productId && !PRODUCT_IDS.includes(ev.productId)) {
    return json(200, { ok: true, ignored: 'other_product' });
  }

  const { data, error } = await db.rpc('hotmart_apply_event', {
    p_event_id: ev.eventId,
    p_event_type: ev.eventType,
    p_event_time: ev.eventTime,
    p_subscriber_code: ev.subscriberCode,
    p_transaction: ev.transaction,
    p_buyer_email: ev.buyerEmail,
    // A purchase always needs a plan (falls back to the default); other events only change
    // the plan when the offer is in HOTMART_PLAN_MAP, so an unknown offer never downgrades anyone.
    p_plan_code: ev.eventType === 'PURCHASE_APPROVED' || ev.eventType === 'PURCHASE_COMPLETE'
      ? planFor(ev.planKeys, PLAN_MAP, DEFAULT_PLAN) : planFor(ev.planKeys, PLAN_MAP, '') || null,
    p_period_end: ev.periodEnd ?? oneTimeEnd(ev),
    p_payload: ev.payload,
  });
  if (error) {
    console.error('hotmart_apply_event failed', ev.eventType, ev.eventId, error.message);
    return json(500, { error: 'not_saved' });
  }
  console.log('hotmart', ev.eventType, ev.eventId, data);
  return json(200, { ok: true, outcome: data });
});
