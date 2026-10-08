// Hotmart implementation of the PaymentProvider interface.
//
// Configuration (server-side secrets only — Supabase → Edge Functions → Secrets):
//   HOTMART_PRODUCT_ID       Hotmart product id; webhook events for other products are ignored
//   HOTMART_CHECKOUT_URL     the product's pay link, e.g. https://pay.hotmart.com/A12345678B?off=abcd1234
//   HOTMART_WEBHOOK_SECRET   the "hottok" from Hotmart → Tools → Webhook (sent as X-HOTMART-HOTTOK)
//   HOTMART_CLIENT_ID        Hotmart → Tools → Developer credentials (for verify / cancel)
//   HOTMART_CLIENT_SECRET
//   HOTMART_BASIC            the "Basic" token shown next to those credentials
//
// Status: the webhook path is tested with simulated payloads. The developer-API calls
// (verifySubscription, cancelSubscription) follow Hotmart's published API but have NOT been
// exercised against Hotmart from this environment — test them with your credentials in
// Hotmart's sandbox before relying on them.
import type {
  BillingUser, CancelResult, CheckoutResult, Db, Fetch, NotConfigured, PaymentProvider,
  SubscriptionView, VerifyResult,
} from './provider.ts';
import { parseHotmart, toIso } from './hotmart-parse.ts';

export interface HotmartConfig {
  productId: string;
  checkoutUrl: string;
  webhookSecret: string;
  clientId: string;
  clientSecret: string;
  basic: string;
  authUrl: string;        // default https://api-sec-vlc.hotmart.com/security/oauth/token
  apiUrl: string;         // default https://developers.hotmart.com
}

export function hotmartConfigFromEnv(get: (k: string) => string | undefined): HotmartConfig {
  return {
    productId: (get('HOTMART_PRODUCT_ID') ?? '').trim(),
    checkoutUrl: (get('HOTMART_CHECKOUT_URL') ?? '').trim(),
    webhookSecret: get('HOTMART_WEBHOOK_SECRET') ?? '',
    clientId: get('HOTMART_CLIENT_ID') ?? '',
    clientSecret: get('HOTMART_CLIENT_SECRET') ?? '',
    basic: (get('HOTMART_BASIC') ?? '').replace(/^Basic\s+/i, ''),
    authUrl: get('HOTMART_AUTH_URL') || 'https://api-sec-vlc.hotmart.com/security/oauth/token',
    apiUrl: (get('HOTMART_API_URL') || 'https://developers.hotmart.com').replace(/\/$/, ''),
  };
}

// Where a buyer manages (and can cancel) Hotmart purchases themselves.
export const HOTMART_MANAGE_URL = 'https://consumer.hotmart.com/purchase';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

// Constant-time comparison (hash both sides so lengths match).
async function sameSecret(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [x, y] = await Promise.all([crypto.subtle.digest('SHA-256', enc.encode(a)), crypto.subtle.digest('SHA-256', enc.encode(b))]);
  const ua = new Uint8Array(x), ub = new Uint8Array(y);
  let diff = 0;
  for (let i = 0; i < ua.length; i++) diff |= ua[i] ^ ub[i];
  return diff === 0;
}

// Hotmart subscription statuses (developer API) → the webhook event with the same meaning,
// so a verified API answer goes through exactly the same state machine as a webhook.
export function eventForApiStatus(status: string): string | null {
  switch (status) {
    case 'ACTIVE': case 'STARTED':                 return 'PURCHASE_APPROVED';
    case 'DELAYED': case 'OVERDUE':                return 'PURCHASE_DELAYED';
    case 'CANCELLED_BY_CUSTOMER': case 'CANCELLED_BY_SELLER': case 'CANCELLED_BY_ADMIN':
                                                   return 'SUBSCRIPTION_CANCELLATION';
    case 'INACTIVE': case 'EXPIRED':               return 'PURCHASE_EXPIRED';
    default:                                       return null;
  }
}

interface BillingProfile {
  email: string; full_name: string | null; status: string | null; subscriber_code: string | null;
  current_period_end: string | null; access: string | null;
}

export function createHotmartProvider(cfg: HotmartConfig, db: Db, fetchFn: Fetch = fetch): PaymentProvider {
  const missing = (keys: Array<[string, string]>): NotConfigured | null => {
    const m = keys.filter(([, v]) => !v).map(([k]) => k);
    return m.length ? { ok: false, reason: 'not_configured', missing: m, manageUrl: HOTMART_MANAGE_URL } : null;
  };
  const apiMissing = () => missing([['HOTMART_CLIENT_ID', cfg.clientId], ['HOTMART_CLIENT_SECRET', cfg.clientSecret], ['HOTMART_BASIC', cfg.basic]]);

  async function profile(userId: string): Promise<BillingProfile | null> {
    const { data, error } = await db.rpc('svc_billing_profile', { p_user: userId });
    if (error) throw new Error(error.message);
    return (data as BillingProfile | null) ?? null;
  }

  const view = (p: BillingProfile): SubscriptionView => ({
    status: p.status, access: p.access, currentPeriodEnd: p.current_period_end, subscriberCode: p.subscriber_code,
  });

  async function applyEvent(ev: {
    eventId: string; eventType: string; eventTime: string | null; checkoutToken: string | null;
    subscriberCode: string | null; transaction: string | null; buyerEmail: string | null;
    periodEnd: string | null; amount: number | null; currency: string | null; payload: Record<string, unknown>;
  }) {
    return db.rpc('svc_apply_hotmart_event', {
      p_event_id: ev.eventId, p_event_type: ev.eventType, p_event_time: ev.eventTime,
      p_checkout_token: ev.checkoutToken, p_subscriber_code: ev.subscriberCode, p_transaction: ev.transaction,
      p_buyer_email: ev.buyerEmail, p_period_end: ev.periodEnd, p_amount: ev.amount, p_currency: ev.currency,
      p_payload: ev.payload,
    });
  }

  async function accessToken(): Promise<string> {
    const url = `${cfg.authUrl}?grant_type=client_credentials&client_id=${encodeURIComponent(cfg.clientId)}&client_secret=${encodeURIComponent(cfg.clientSecret)}`;
    const res = await fetchFn(url, { method: 'POST', headers: { Authorization: `Basic ${cfg.basic}`, 'Content-Type': 'application/json' } });
    if (!res.ok) throw new Error(`hotmart auth ${res.status}`);
    const body = await res.json() as { access_token?: string };
    if (!body.access_token) throw new Error('hotmart auth: no token');
    return body.access_token;
  }

  return {
    async createCheckout(user: BillingUser): Promise<CheckoutResult> {
      const nc = missing([['HOTMART_CHECKOUT_URL', cfg.checkoutUrl]]);
      if (nc) return nc;
      const p = await profile(user.id);
      if (!p) return { ok: false, reason: 'not_found' };
      const { data: token, error } = await db.rpc('svc_create_checkout_session', { p_user: user.id });
      if (error || typeof token !== 'string') return { ok: false, reason: 'provider_error', message: error?.message };
      const url = new URL(cfg.checkoutUrl);
      url.searchParams.set('sck', token);           // comes back in the webhook as purchase.origin.sck
      url.searchParams.set('email', p.email);       // pre-fills Hotmart's form
      if (p.full_name) url.searchParams.set('name', p.full_name);
      return { ok: true, url: url.toString() };
    },

    async processWebhook(req: Request): Promise<Response> {
      if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });
      if (!cfg.webhookSecret) return json(500, { error: 'not_configured' });    // fail closed
      const token = req.headers.get('x-hotmart-hottok') ?? '';
      if (!token || !(await sameSecret(token, cfg.webhookSecret))) return json(401, { error: 'invalid_token' });

      const raw = await req.text();
      if (raw.length > 256_000) return json(413, { error: 'too_large' });
      let body: unknown;
      try { body = JSON.parse(raw); } catch { return json(400, { error: 'invalid_json' }); }
      const ev = parseHotmart(body);
      if (!ev) return json(400, { error: 'not_a_hotmart_event' });
      if (cfg.productId && ev.productId && ev.productId !== cfg.productId) {
        return json(200, { ok: true, ignored: 'other_product' });   // 200 so Hotmart stops resending
      }
      const { data, error } = await applyEvent(ev);
      if (error) {
        console.error('svc_apply_hotmart_event failed', ev.eventType, ev.eventId, error.message);
        return json(500, { error: 'not_saved' });                   // Hotmart retries
      }
      console.log('hotmart', ev.eventType, ev.eventId, data);
      return json(200, { ok: true, outcome: data });
    },

    async getSubscriptionStatus(user: BillingUser): Promise<SubscriptionView | null> {
      const p = await profile(user.id);
      return p ? view(p) : null;
    },

    // Asks Hotmart's API for this parent's subscriptions and applies the answer. Useful when a
    // webhook was lost, or right after checkout. The answer comes from Hotmart over an
    // authenticated server-to-server call, so it is a verified status.
    async verifySubscription(user: BillingUser): Promise<VerifyResult> {
      const nc = apiMissing();
      if (nc) return nc;
      const p = await profile(user.id);
      if (!p) return { ok: false, reason: 'not_found' };
      try {
        const tok = await accessToken();
        const qs = new URLSearchParams();
        if (cfg.productId) qs.set('product_id', cfg.productId);
        if (p.subscriber_code) qs.set('subscriber_code', p.subscriber_code);
        else qs.set('subscriber_email', p.email);
        const res = await fetchFn(`${cfg.apiUrl}/payments/api/v1/subscriptions?${qs}`, {
          headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
        });
        if (!res.ok) return { ok: false, reason: 'provider_error', message: `subscriptions ${res.status}` };
        const body = await res.json() as { items?: Array<Record<string, any>> };
        const items = (body.items ?? []).filter(i => !cfg.productId || String(i.product?.id ?? cfg.productId) === cfg.productId);
        if (!items.length) return { ok: false, reason: 'no_subscription' };
        // most recent first; apply oldest → newest so the latest state wins
        items.sort((a, b) => Number(a.accession_date ?? 0) - Number(b.accession_date ?? 0));
        const applied: string[] = [];
        for (const it of items) {
          const type = eventForApiStatus(String(it.status ?? ''));
          if (!type) continue;
          const code = String(it.subscriber?.code ?? it.subscriber_code ?? '');
          const next = toIso(it.date_next_charge);
          const { data, error } = await applyEvent({
            eventId: `verify:${code}:${it.status}:${it.date_next_charge ?? ''}`,
            eventType: type, eventTime: null, checkoutToken: null, subscriberCode: code || null,
            transaction: null, buyerEmail: p.email, periodEnd: next, amount: null, currency: null,
            payload: { source: 'api_verify', status: it.status, date_next_charge: it.date_next_charge, plan: it.plan?.name },
          });
          if (error) return { ok: false, reason: 'provider_error', message: error.message };
          applied.push(String(data));
        }
        const after = await profile(user.id);
        return { ok: true, applied, subscription: view(after ?? p) };
      } catch (e) {
        return { ok: false, reason: 'provider_error', message: e instanceof Error ? e.message : String(e) };
      }
    },

    // Asks Hotmart to cancel. We do NOT change the status here: Hotmart confirms with a
    // SUBSCRIPTION_CANCELLATION webhook, and access then lasts until the paid period ends.
    async cancelSubscription(user: BillingUser): Promise<CancelResult> {
      const nc = apiMissing();
      if (nc) return nc;
      const p = await profile(user.id);
      if (!p?.subscriber_code) return { ok: false, reason: 'no_subscription' };
      try {
        const tok = await accessToken();
        const res = await fetchFn(`${cfg.apiUrl}/payments/api/v1/subscriptions/${encodeURIComponent(p.subscriber_code)}/cancel`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ send_mail: true }),
        });
        if (!res.ok) return { ok: false, reason: 'provider_error', message: `cancel ${res.status}` };
        return { ok: true, requested: true };
      } catch (e) {
        return { ok: false, reason: 'provider_error', message: e instanceof Error ? e.message : String(e) };
      }
    },
  };
}
