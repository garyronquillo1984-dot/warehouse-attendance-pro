// Reads a Hotmart webhook (version 2.0.0) into the fields the state machine needs.
// Plain TypeScript with no runtime APIs: tested with Node, runs in Deno.
//
// Payload shapes (Hotmart developer docs, webhook 2.0.0):
//   every event:  { id, creation_date (ms), event, version, data }
//   purchase:     data.purchase.transaction, .date_next_charge, .price.value, .price.currency_value,
//                 .origin.sck (our checkout token), data.buyer.email,
//                 data.subscription.subscriber.code, data.product.id
//   SUBSCRIPTION_CANCELLATION: data.subscriber.code/email, data.date_next_charge, data.product.id
//   UPDATE_SUBSCRIPTION_CHARGE_DATE: data.subscriber.code, data.subscription.date_next_charge

export interface HotmartEvent {
  eventId: string;
  eventType: string;
  eventTime: string | null;      // ISO
  productId: string | null;
  checkoutToken: string | null;  // the "sck" we put on the checkout link
  subscriberCode: string | null;
  transaction: string | null;
  buyerEmail: string | null;
  periodEnd: string | null;      // ISO, next charge date
  amount: number | null;
  currency: string | null;
  payload: Record<string, unknown>;   // trimmed copy for audit: no name, phone, document or address
}

type Obj = Record<string, any>;
const str = (v: unknown) => (v === null || v === undefined || v === '' ? null : String(v));

// Hotmart sends milliseconds, sometimes as a string, sometimes ISO; small numbers are seconds.
export function toIso(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number' || (typeof v === 'string' && /^\d+$/.test(v))) {
    const n = Number(v);
    const d = new Date(n < 1e11 ? n * 1000 : n);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  const d = new Date(String(v));
  return isNaN(d.getTime()) ? null : d.toISOString();
}

// Our checkout tokens are 36 hex characters; anything else in "sck" is someone else's tracking.
const TOKEN_RE = /^[0-9a-f]{36}$/;

export function parseHotmart(body: unknown): HotmartEvent | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Obj;
  const data: Obj = b.data && typeof b.data === 'object' ? b.data : {};
  const eventId = str(b.id);
  const eventType = str(b.event);
  if (!eventId || !eventType) return null;

  const purchase: Obj = data.purchase ?? {};
  const subscription: Obj = data.subscription ?? {};
  const subscriber: Obj = data.subscriber ?? subscription.subscriber ?? {};
  const sck = str(purchase.origin?.sck ?? purchase.sck);
  const amount = Number(purchase.price?.value ?? purchase.full_price?.value);

  return {
    eventId,
    eventType,
    eventTime: toIso(b.creation_date),
    productId: str(data.product?.id ?? subscription.product?.id),
    checkoutToken: sck && TOKEN_RE.test(sck) ? sck : null,
    subscriberCode: str(subscriber.code ?? subscription.subscriber_code),
    transaction: str(purchase.transaction),
    buyerEmail: str(data.buyer?.email ?? subscriber.email ?? subscription.user?.email)?.trim().toLowerCase() ?? null,
    periodEnd: toIso(purchase.date_next_charge ?? data.date_next_charge ?? subscription.date_next_charge),
    amount: Number.isFinite(amount) ? amount : null,
    currency: str(purchase.price?.currency_value ?? purchase.full_price?.currency_value),
    payload: {
      id: eventId, event: eventType, version: b.version, creation_date: b.creation_date,
      product: data.product ? { id: data.product.id, name: data.product.name } : undefined,
      purchase: data.purchase ? {
        transaction: purchase.transaction, status: purchase.status, approved_date: purchase.approved_date,
        date_next_charge: purchase.date_next_charge, recurrence_number: purchase.recurrence_number,
        offer: purchase.offer, price: purchase.price, payment: purchase.payment ? { type: purchase.payment.type } : undefined,
      } : undefined,
      subscription: data.subscription ? {
        status: subscription.status, plan: subscription.plan,
        subscriber_code: subscriber.code ?? subscription.subscriber_code, date_next_charge: subscription.date_next_charge,
      } : undefined,
      date_next_charge: data.date_next_charge, cancellation_date: data.cancellation_date,
    },
  };
}
