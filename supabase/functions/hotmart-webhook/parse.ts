// Reads a Hotmart webhook (version 2.0.0) into the fields our license logic needs.
// Plain TypeScript with no runtime APIs, so it is tested with Node and runs in Deno.
//
// Payload shapes (Hotmart developer docs, webhook 2.0.0):
//   every event:  { id, creation_date (ms), event, version, data }
//   purchase:     data.purchase.transaction, data.purchase.date_next_charge, data.purchase.offer.code,
//                 data.buyer.email, data.subscription.subscriber.code, data.subscription.plan.name,
//                 data.product.id
//   SUBSCRIPTION_CANCELLATION: data.subscriber.code/email, data.date_next_charge, data.product.id
//   SWITCH_PLAN:  data.subscription.subscriber_code, data.subscription.user.email,
//                 data.subscription.date_next_charge, data.plans[].current, data.subscription.product.id
//   UPDATE_SUBSCRIPTION_CHARGE_DATE: data.subscriber.code/email, data.subscription.date_next_charge (ISO),
//                 data.plan.name, data.subscription.product.id

export interface HotmartEvent {
  eventId: string;
  eventType: string;
  eventTime: string | null;      // ISO
  productId: string | null;
  subscriberCode: string | null;
  transaction: string | null;
  buyerEmail: string | null;
  planKeys: string[];            // offer codes / plan names / plan ids, most specific first
  periodEnd: string | null;      // ISO
  payload: Record<string, unknown>;   // trimmed copy kept for audit (no phone, document or address)
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
  const currentPlan: Obj | undefined = Array.isArray(data.plans) ? data.plans.find((p: Obj) => p?.current) : undefined;

  const planKeys = [
    currentPlan?.offer?.key, currentPlan?.offer?.code, currentPlan?.name, currentPlan?.id,
    purchase.offer?.code, subscription.plan?.name, subscription.plan?.id,
    data.plan?.offer?.code, data.plan?.name, data.plan?.id,
  ].map(str).filter((x): x is string => !!x);

  return {
    eventId,
    eventType,
    eventTime: toIso(b.creation_date),
    productId: str(data.product?.id ?? subscription.product?.id),
    subscriberCode: str(subscriber.code ?? subscription.subscriber_code),
    transaction: str(purchase.transaction),
    buyerEmail: str(data.buyer?.email ?? subscriber.email ?? subscription.user?.email)?.trim().toLowerCase() ?? null,
    planKeys,
    periodEnd: toIso(purchase.date_next_charge ?? data.date_next_charge ?? subscription.date_next_charge),
    payload: {
      id: eventId, event: eventType, version: b.version, creation_date: b.creation_date,
      product: data.product ? { id: data.product.id, name: data.product.name } : undefined,
      purchase: data.purchase ? {
        transaction: purchase.transaction, status: purchase.status, approved_date: purchase.approved_date,
        date_next_charge: purchase.date_next_charge, recurrence_number: purchase.recurrence_number,
        offer: purchase.offer, price: purchase.price,
      } : undefined,
      subscription: data.subscription ? {
        status: subscription.status, plan: subscription.plan, subscriber_code: subscriber.code ?? subscription.subscriber_code,
        date_next_charge: subscription.date_next_charge,
      } : undefined,
      plans: data.plans, date_next_charge: data.date_next_charge, cancellation_date: data.cancellation_date,
    },
  };
}

// Which of our plans this purchase is. The map comes from configuration, e.g.
// {"abc123": "professional", "Plano Anual": "business"}; unknown → the default plan.
export function planFor(keys: string[], map: Record<string, string>, fallback: string): string {
  for (const k of keys) if (map[k]) return map[k];
  return fallback;
}
