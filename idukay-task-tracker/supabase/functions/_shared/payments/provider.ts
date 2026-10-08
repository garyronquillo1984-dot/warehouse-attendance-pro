// The payment layer as an interface. Hotmart implements it today (hotmart.ts); another
// provider could replace it without touching the app or the database state machine.
//
// Rules that every implementation must follow:
//   * never mark anyone as paid without a verified provider event or API answer;
//   * never handle card data (the provider's checkout page does);
//   * secrets come from server-side configuration only.

export interface BillingUser {
  id: string;
}

export interface SubscriptionView {
  status: string | null;           // TRIAL | ACTIVE | PAYMENT_PENDING | PAYMENT_FAILED | CANCELLED | EXPIRED
  access: string | null;           // trial | active | grace | locked
  currentPeriodEnd: string | null;
  subscriberCode: string | null;
}

export type NotConfigured = { ok: false; reason: 'not_configured'; missing: string[]; manageUrl?: string };
export type Failure = { ok: false; reason: 'provider_error' | 'no_subscription' | 'not_found'; message?: string };

export type CheckoutResult = { ok: true; url: string } | NotConfigured | Failure;
export type VerifyResult =
  | { ok: true; applied: string[]; subscription: SubscriptionView }
  | NotConfigured | Failure;
export type CancelResult = { ok: true; requested: true } | NotConfigured | Failure;

export interface PaymentProvider {
  createCheckout(user: BillingUser): Promise<CheckoutResult>;
  verifySubscription(user: BillingUser): Promise<VerifyResult>;
  processWebhook(request: Request): Promise<Response>;
  getSubscriptionStatus(user: BillingUser): Promise<SubscriptionView | null>;
  cancelSubscription(user: BillingUser): Promise<CancelResult>;
}

// The two things a provider needs from the outside world. Both are injected so the same
// code runs in Supabase Edge Functions (Deno), in Node for local tests, or elsewhere.
export interface Db {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }>;
}
export type Fetch = (input: string, init?: RequestInit) => Promise<Response>;
