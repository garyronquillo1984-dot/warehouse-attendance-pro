// POST /functions/v1/billing   { "action": "checkout" | "status" | "verify" | "cancel" }
// Signed-in parents only. The user is taken from the verified session, never from the body.
import type { PaymentProvider } from '../_shared/payments/provider.ts';

export interface BillingDeps {
  provider: PaymentProvider;
  userIdFromRequest(req: Request): Promise<string | null>;   // verifies the JWT
  allowedOrigin: string;                                      // e.g. https://app.example.com, or *
}

export async function handleBilling(req: Request, deps: BillingDeps): Promise<Response> {
  const cors = {
    'Access-Control-Allow-Origin': deps.allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
  const reply = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return reply(405, { error: 'method_not_allowed' });

  const userId = await deps.userIdFromRequest(req);
  if (!userId) return reply(401, { error: 'not_signed_in' });

  let action = '';
  try { action = String((await req.json() as { action?: string }).action ?? ''); } catch { /* empty body */ }
  const user = { id: userId };
  try {
    switch (action) {
      case 'checkout': return reply(200, await deps.provider.createCheckout(user));
      case 'status':   return reply(200, { ok: true, subscription: await deps.provider.getSubscriptionStatus(user) });
      case 'verify':   return reply(200, await deps.provider.verifySubscription(user));
      case 'cancel':   return reply(200, await deps.provider.cancelSubscription(user));
      default:         return reply(400, { error: 'unknown_action' });
    }
  } catch (e) {
    console.error('billing', action, e);
    return reply(500, { error: 'internal' });
  }
}
