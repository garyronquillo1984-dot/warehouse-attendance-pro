import { test, eq, truthy } from './harness.mts';
import { parseHotmart } from '../../supabase/functions/_shared/payments/hotmart-parse.ts';
import { createHotmartProvider, hotmartConfigFromEnv, eventForApiStatus } from '../../supabase/functions/_shared/payments/hotmart.ts';
import { handleBilling } from '../../supabase/functions/billing/handler.ts';

const TOKEN = 'a'.repeat(36);
const purchase = (over: Record<string, unknown> = {}) => ({
  id: 'evt-1', event: 'PURCHASE_APPROVED', version: '2.0.0', creation_date: 1791400000000,
  data: {
    product: { id: 4242, name: 'Task Tracker' },
    buyer: { email: ' Parent@Example.COM ', name: 'Parent', checkout_phone: '+59399', document: '123' },
    purchase: { transaction: 'HP123', date_next_charge: 1794000000000, price: { value: 2.99, currency_value: 'USD' },
                origin: { sck: TOKEN }, status: 'APPROVED' },
    subscription: { subscriber: { code: 'SUB1' }, status: 'ACTIVE', plan: { name: 'Mensual' } },
    ...over,
  },
});

// ---------- parsing ----------
test('parse: purchase with our checkout token', () => {
  const ev = parseHotmart(purchase())!;
  eq([ev.eventId, ev.eventType, ev.productId, ev.checkoutToken, ev.subscriberCode, ev.transaction, ev.buyerEmail, ev.amount, ev.currency],
     ['evt-1', 'PURCHASE_APPROVED', '4242', TOKEN, 'SUB1', 'HP123', 'parent@example.com', 2.99, 'USD']);
  eq(ev.periodEnd, new Date(1794000000000).toISOString());
  truthy(!JSON.stringify(ev.payload).includes('checkout_phone') && !JSON.stringify(ev.payload).includes('"document"'), 'payload must drop buyer personal data');
});
test('parse: foreign sck is not treated as our token', () => {
  eq(parseHotmart(purchase({ purchase: { origin: { sck: 'instagram_bio' } } }))!.checkoutToken, null);
});
test('parse: cancellation shape', () => {
  const ev = parseHotmart({ id: 'c1', event: 'SUBSCRIPTION_CANCELLATION', creation_date: '1791400000000',
    data: { product: { id: 4242 }, subscriber: { code: 'SUB1', email: 'p@x.com' }, date_next_charge: 1794000000000 } })!;
  eq([ev.subscriberCode, ev.buyerEmail, ev.periodEnd], ['SUB1', 'p@x.com', new Date(1794000000000).toISOString()]);
});
test('parse: rejects non-events', () => {
  eq(parseHotmart(null), null); eq(parseHotmart({ event: 'X' }), null); eq(parseHotmart('x'), null);
});
test('api status mapping', () => {
  eq(['ACTIVE', 'DELAYED', 'CANCELLED_BY_CUSTOMER', 'INACTIVE', '???'].map(eventForApiStatus),
     ['PURCHASE_APPROVED', 'PURCHASE_DELAYED', 'SUBSCRIPTION_CANCELLATION', 'PURCHASE_EXPIRED', null]);
});

// ---------- fakes ----------
function fakeDb(profile: Record<string, unknown> | null = { email: 'parent@example.com', full_name: 'Ana Pérez', status: 'TRIAL', subscriber_code: null, current_period_end: null, access: 'trial' }) {
  const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  return {
    calls,
    failApply: false,
    async rpc(fn: string, args: Record<string, unknown>) {
      calls.push({ fn, args });
      if (fn === 'svc_billing_profile') return { data: profile, error: null };
      if (fn === 'svc_create_checkout_session') return { data: TOKEN, error: null };
      if (fn === 'svc_apply_hotmart_event') return this.failApply ? { data: null, error: { message: 'db down' } } : { data: 'activated', error: null };
      return { data: null, error: { message: 'unknown rpc' } };
    },
  };
}
const env = (o: Record<string, string>) => hotmartConfigFromEnv(k => o[k]);
const FULL = { HOTMART_PRODUCT_ID: '4242', HOTMART_CHECKOUT_URL: 'https://pay.hotmart.com/A123B?off=xyz',
  HOTMART_WEBHOOK_SECRET: 'hottok-secret', HOTMART_CLIENT_ID: 'cid', HOTMART_CLIENT_SECRET: 'csecret', HOTMART_BASIC: 'Basic YmFzaWM=' };
const hook = (body: unknown, token = 'hottok-secret', method = 'POST') =>
  new Request('https://x/hotmart-webhook', { method, headers: { 'x-hotmart-hottok': token, 'content-type': 'application/json' },
    body: method === 'POST' ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined });

// ---------- webhook ----------
test('webhook: refuses everything until the secret is configured', async () => {
  const db = fakeDb();
  const res = await createHotmartProvider(env({}), db).processWebhook(hook(purchase()));
  eq(res.status, 500); eq(db.calls.length, 0);
});
test('webhook: wrong token → 401, nothing applied', async () => {
  const db = fakeDb();
  eq((await createHotmartProvider(env(FULL), db).processWebhook(hook(purchase(), 'guess'))).status, 401);
  eq((await createHotmartProvider(env(FULL), db).processWebhook(hook(purchase(), ''))).status, 401);
  eq(db.calls.length, 0);
});
test('webhook: GET → 405, bad JSON → 400, not an event → 400', async () => {
  const p = createHotmartProvider(env(FULL), fakeDb());
  eq((await p.processWebhook(hook(null, 'hottok-secret', 'GET'))).status, 405);
  eq((await p.processWebhook(hook('{nope'))).status, 400);
  eq((await p.processWebhook(hook({ hello: 1 }))).status, 400);
});
test('webhook: other products are acknowledged and ignored', async () => {
  const db = fakeDb();
  const res = await createHotmartProvider(env(FULL), db).processWebhook(hook(purchase({ product: { id: 999 } })));
  eq(res.status, 200); eq((await res.json()).ignored, 'other_product'); eq(db.calls.length, 0);
});
test('webhook: valid event goes to the state machine with every field', async () => {
  const db = fakeDb();
  const res = await createHotmartProvider(env(FULL), db).processWebhook(hook(purchase()));
  eq(res.status, 200);
  eq(db.calls[0].fn, 'svc_apply_hotmart_event');
  const a = db.calls[0].args;
  eq([a.p_event_id, a.p_event_type, a.p_checkout_token, a.p_subscriber_code, a.p_buyer_email, a.p_amount],
     ['evt-1', 'PURCHASE_APPROVED', TOKEN, 'SUB1', 'parent@example.com', 2.99]);
});
test('webhook: database failure → 500 so Hotmart retries', async () => {
  const db = fakeDb(); db.failApply = true;
  eq((await createHotmartProvider(env(FULL), db).processWebhook(hook(purchase()))).status, 500);
});
test('webhook: oversized body → 413', async () => {
  eq((await createHotmartProvider(env(FULL), fakeDb()).processWebhook(hook('x'.repeat(300_000)))).status, 413);
});

// ---------- checkout ----------
test('checkout: not configured says so (never fakes a payment)', async () => {
  const r = await createHotmartProvider(env({}), fakeDb()).createCheckout({ id: 'u1' });
  eq(r.ok, false); eq((r as { reason: string }).reason, 'not_configured');
});
test('checkout: Hotmart link with our token and pre-filled e-mail', async () => {
  const db = fakeDb();
  const r = await createHotmartProvider(env(FULL), db).createCheckout({ id: 'u1' });
  truthy(r.ok, 'checkout ok');
  const u = new URL((r as { url: string }).url);
  eq([u.origin + u.pathname, u.searchParams.get('off'), u.searchParams.get('sck'), u.searchParams.get('email'), u.searchParams.get('name')],
     ['https://pay.hotmart.com/A123B', 'xyz', TOKEN, 'parent@example.com', 'Ana Pérez']);
  eq(db.calls.map(c => c.fn), ['svc_billing_profile', 'svc_create_checkout_session']);
});

// ---------- verify / cancel ----------
function fakeFetch(subs: unknown[], log: string[]) {
  return async (url: string, init?: RequestInit) => {
    log.push(`${init?.method ?? 'GET'} ${url} ${new Headers(init?.headers).get('authorization')}`);
    if (url.startsWith('https://api-sec-vlc.hotmart.com')) return new Response(JSON.stringify({ access_token: 'tok' }));
    if (url.includes('/subscriptions?')) return new Response(JSON.stringify({ items: subs }));
    if (url.endsWith('/cancel')) return new Response('{}');
    return new Response('nope', { status: 404 });
  };
}
test('verify: not configured without API credentials', async () => {
  const r = await createHotmartProvider(env({ HOTMART_CHECKOUT_URL: 'https://pay.hotmart.com/x' }), fakeDb()).verifySubscription({ id: 'u1' });
  eq((r as { reason: string }).reason, 'not_configured');
  eq((r as { missing: string[] }).missing, ['HOTMART_CLIENT_ID', 'HOTMART_CLIENT_SECRET', 'HOTMART_BASIC']);
});
test('verify: Hotmart answer is applied through the same state machine', async () => {
  const db = fakeDb(); const log: string[] = [];
  const r = await createHotmartProvider(env(FULL), db, fakeFetch([
    { subscriber: { code: 'SUB9' }, status: 'ACTIVE', date_next_charge: 1794000000000, product: { id: 4242 }, accession_date: 1 },
  ], log)).verifySubscription({ id: 'u1' });
  truthy(r.ok, JSON.stringify(r));
  truthy(log[0].startsWith('POST https://api-sec-vlc.hotmart.com/security/oauth/token?grant_type=client_credentials&client_id=cid') && log[0].endsWith('Basic YmFzaWM='), log[0]);
  truthy(log[1].includes('/payments/api/v1/subscriptions?product_id=4242&subscriber_email=parent%40example.com') && log[1].endsWith('Bearer tok'), log[1]);
  const apply = db.calls.find(c => c.fn === 'svc_apply_hotmart_event')!.args;
  eq([apply.p_event_type, apply.p_subscriber_code, apply.p_period_end], ['PURCHASE_APPROVED', 'SUB9', new Date(1794000000000).toISOString()]);
});
test('verify: no subscription at Hotmart → nothing applied', async () => {
  const db = fakeDb();
  const r = await createHotmartProvider(env(FULL), db, fakeFetch([], [])).verifySubscription({ id: 'u1' });
  eq((r as { reason: string }).reason, 'no_subscription');
  eq(db.calls.some(c => c.fn === 'svc_apply_hotmart_event'), false);
});
test('cancel: asks Hotmart and leaves the status to the webhook', async () => {
  const db = fakeDb({ email: 'p@x.com', full_name: 'P', status: 'ACTIVE', subscriber_code: 'SUB1', current_period_end: null, access: 'active' });
  const log: string[] = [];
  const r = await createHotmartProvider(env(FULL), db, fakeFetch([], log)).cancelSubscription({ id: 'u1' });
  eq(r, { ok: true, requested: true });
  truthy(log[1].startsWith('POST https://developers.hotmart.com/payments/api/v1/subscriptions/SUB1/cancel'), log[1]);
  eq(db.calls.some(c => c.fn === 'svc_apply_hotmart_event'), false);
});
test('cancel: without a subscription', async () => {
  eq((await createHotmartProvider(env(FULL), fakeDb(), fakeFetch([], [])).cancelSubscription({ id: 'u1' }) as { reason: string }).reason, 'no_subscription');
});

// ---------- billing endpoint ----------
const deps = (userId: string | null) => ({ provider: createHotmartProvider(env(FULL), fakeDb()), allowedOrigin: 'https://app.test', userIdFromRequest: async () => userId });
const post = (body: unknown) => new Request('https://x/billing', { method: 'POST', body: JSON.stringify(body) });
test('billing: signed-out → 401', async () => eq((await handleBilling(post({ action: 'checkout' }), deps(null))).status, 401));
test('billing: preflight and unknown action', async () => {
  eq((await handleBilling(new Request('https://x/billing', { method: 'OPTIONS' }), deps(null))).status, 204);
  eq((await handleBilling(post({ action: 'make_me_rich' }), deps('u1'))).status, 400);
});
test('billing: checkout for the signed-in user', async () => {
  const res = await handleBilling(post({ action: 'checkout', user_id: 'someone-else' }), deps('u1'));
  eq(res.status, 200); eq(res.headers.get('access-control-allow-origin'), 'https://app.test');
  truthy((await res.json()).url.startsWith('https://pay.hotmart.com/A123B'));
});
